/**
 * Redirects: CRUD for the settings page, CSV import, and the lookup the
 * public site uses when a path is not found.
 *
 *   const hit = await resolveRedirect(site.id, '/gammel/sti');   // { toPath, statusCode } | null, counts a hit
 *   const preview = await lookupRedirect(site.id, '/gammel/sti'); // same, without counting
 *
 * Rules (SPEC 5.3 + settings brief): fromPath starts with '/', is unique per
 * site and normalised (no trailing slash, no query); toPath is a site path or
 * an absolute http(s) URL; a redirect may never lead back to its own fromPath
 * through any chain of existing redirects.
 */
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { redirects, type Redirect } from '@/db/schema';
import { uuidSchema } from '@/lib/validation/common';
import { ActionError, ConflictError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];

export type ResolvedRedirect = { toPath: string; statusCode: RedirectStatusCode };

const MAX_PATH = 500;
const MAX_CHAIN = 25;

/** Leading slash, no trailing slash, no query/hash, percent-decoded, no doubled slashes. */
export function normalizeRedirectPath(path: string): string {
  let p = (path ?? '').trim().split('?')[0]?.split('#')[0] ?? '/';
  if (!p.startsWith('/')) p = `/${p}`;
  try {
    p = decodeURIComponent(p);
  } catch {
    // Not valid percent-encoding: keep the raw value.
  }
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalise a target: site paths like fromPath, absolute URLs untouched (trimmed). */
export function normalizeRedirectTarget(value: string): string {
  const v = value.trim();
  if (isAbsoluteHttpUrl(v)) return v;
  return normalizeRedirectPath(v);
}

export const fromPathSchema = z
  .string()
  .trim()
  .min(1, 'Fra-sti må fylles ut')
  .max(MAX_PATH, `Maks ${MAX_PATH} tegn`)
  .refine((v) => v.startsWith('/'), 'Fra-sti må starte med /')
  .refine((v) => !/\s/.test(v), 'Fra-sti kan ikke inneholde mellomrom')
  .transform(normalizeRedirectPath)
  .refine((v) => v !== '/', 'Forsiden kan ikke omdirigeres')
  .refine((v) => !v.startsWith('/admin') && !v.startsWith('/api') && !v.startsWith('/media'), {
    error: 'Stier under /admin, /api og /media kan ikke omdirigeres',
  });

export const toPathSchema = z
  .string()
  .trim()
  .min(1, 'Til-sti må fylles ut')
  .max(2000, 'Maks 2000 tegn')
  .refine((v) => !/\s/.test(v), 'Til-sti kan ikke inneholde mellomrom')
  .refine((v) => v.startsWith('/') || isAbsoluteHttpUrl(v), {
    error: 'Til-sti må starte med / eller være en full adresse (https://…)',
  })
  .transform(normalizeRedirectTarget);

export const statusCodeSchema = z.coerce
  .number()
  .int()
  .refine((v): v is RedirectStatusCode => (REDIRECT_STATUS_CODES as readonly number[]).includes(v), {
    error: 'Statuskode må være 301, 302, 307 eller 308',
  });

export const redirectInputSchema = z
  .object({
    fromPath: fromPathSchema,
    toPath: toPathSchema,
    statusCode: statusCodeSchema.default(301),
  })
  .refine((v) => v.fromPath !== v.toPath, {
    error: 'Fra- og til-sti kan ikke være like',
    path: ['toPath'],
  });
export type RedirectInput = z.input<typeof redirectInputSchema>;
export type RedirectOutput = z.output<typeof redirectInputSchema>;

export const redirectListSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['created', 'hits', 'from']).default('created'),
});
export type RedirectListQuery = z.input<typeof redirectListSchema>;

export type RedirectPage = { items: Redirect[]; total: number; page: number; perPage: number };

/* -------------------------------------------------------------------------- */
/*  Lookup                                                                     */
/* -------------------------------------------------------------------------- */

function toStatus(code: number): RedirectStatusCode {
  return (REDIRECT_STATUS_CODES as readonly number[]).includes(code) ? (code as RedirectStatusCode) : 301;
}

async function findRow(siteId: string, path: string): Promise<Redirect | null> {
  const fromPath = normalizeRedirectPath(path);
  const [row] = await db
    .select()
    .from(redirects)
    .where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, fromPath)))
    .limit(1);
  return row ?? null;
}

/** Count a hit without blocking the response; errors are logged, never thrown. */
export function recordRedirectHit(id: string): Promise<void> {
  return db
    .update(redirects)
    .set({ hits: sql`${redirects.hits} + 1` })
    .where(eq(redirects.id, id))
    .then(() => undefined)
    .catch((err: unknown) => console.error('[redirects] hit counter', err));
}

/**
 * The redirect for a public path, or null. Increments `hits` fire-and-forget.
 * Used by the public `[section]/[slug]` route before it 404s.
 */
export async function resolveRedirect(siteId: string, path: string): Promise<ResolvedRedirect | null> {
  const row = await findRow(siteId, path);
  if (!row) return null;
  if (normalizeRedirectTarget(row.toPath) === row.fromPath) return null;
  void recordRedirectHit(row.id);
  return { toPath: row.toPath, statusCode: toStatus(row.statusCode) };
}

export type RedirectLookup = {
  matched: Redirect | null;
  /** The full chain the visitor would follow, first hop first (at most MAX_CHAIN). */
  chain: { fromPath: string; toPath: string; statusCode: number }[];
  finalPath: string;
  loops: boolean;
};

/** Preview what `resolveRedirect` would do, following chains, without counting hits. */
export async function lookupRedirect(siteId: string, path: string): Promise<RedirectLookup> {
  const all = await db
    .select({ fromPath: redirects.fromPath, toPath: redirects.toPath, statusCode: redirects.statusCode })
    .from(redirects)
    .where(eq(redirects.siteId, siteId));
  const map = new Map(all.map((r) => [r.fromPath, r] as const));
  const start = normalizeRedirectPath(path);
  const matched = await findRow(siteId, start);
  const chain: RedirectLookup['chain'] = [];
  const seen = new Set<string>([start]);
  let current = start;
  let loops = false;
  for (let i = 0; i < MAX_CHAIN; i += 1) {
    const hop = map.get(current);
    if (!hop) break;
    chain.push(hop);
    if (isAbsoluteHttpUrl(hop.toPath)) {
      current = hop.toPath;
      break;
    }
    current = normalizeRedirectPath(hop.toPath);
    if (seen.has(current)) {
      loops = true;
      break;
    }
    seen.add(current);
  }
  return { matched, chain, finalPath: current, loops };
}

/* -------------------------------------------------------------------------- */
/*  Loop detection                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Would a redirect fromPath → toPath (ignoring `excludeId`) lead back to
 * fromPath through the site's existing redirects? Pure walk over a map so
 * it is testable without a database as well.
 */
export function createsLoop(
  fromPath: string,
  toPath: string,
  existing: Iterable<{ id?: string; fromPath: string; toPath: string }>,
  excludeId?: string,
): boolean {
  if (isAbsoluteHttpUrl(toPath)) return false;
  const map = new Map<string, string>();
  for (const r of existing) {
    if (excludeId && r.id === excludeId) continue;
    map.set(r.fromPath, r.toPath);
  }
  map.set(fromPath, toPath);
  let current = normalizeRedirectPath(toPath);
  const seen = new Set<string>([fromPath]);
  for (let i = 0; i < MAX_CHAIN; i += 1) {
    if (current === fromPath) return true;
    const next = map.get(current);
    if (next === undefined || isAbsoluteHttpUrl(next)) return false;
    if (seen.has(current)) return true; // a loop that does not involve fromPath still traps the visitor
    seen.add(current);
    current = normalizeRedirectPath(next);
  }
  return true; // chain longer than MAX_CHAIN: treat as a loop
}

async function assertNoLoop(siteId: string, fromPath: string, toPath: string, excludeId?: string): Promise<void> {
  const existing = await db
    .select({ id: redirects.id, fromPath: redirects.fromPath, toPath: redirects.toPath })
    .from(redirects)
    .where(eq(redirects.siteId, siteId));
  if (createsLoop(fromPath, toPath, existing, excludeId)) {
    throw new ActionError('Omdirigeringen ville skapt en løkke.', 'validation', {
      toPath: ['Omdirigeringen ville skapt en løkke (peker tilbake til fra-stien)'],
    });
  }
}

async function assertUnique(siteId: string, fromPath: string, excludeId?: string): Promise<void> {
  const [dupe] = await db
    .select({ id: redirects.id })
    .from(redirects)
    .where(
      and(
        eq(redirects.siteId, siteId),
        eq(redirects.fromPath, fromPath),
        excludeId ? ne(redirects.id, excludeId) : undefined,
      ),
    )
    .limit(1);
  if (dupe) {
    throw new ConflictError(`Det finnes allerede en omdirigering fra «${fromPath}».`);
  }
}

/* -------------------------------------------------------------------------- */
/*  Queries                                                                    */
/* -------------------------------------------------------------------------- */

export async function listRedirects(siteId: string, query: unknown = {}): Promise<RedirectPage> {
  const q = redirectListSchema.parse(query ?? {});
  const filters: SQL[] = [eq(redirects.siteId, siteId)];
  if (q.q) {
    const pattern = `%${q.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    filters.push(or(ilike(redirects.fromPath, pattern), ilike(redirects.toPath, pattern)) as SQL);
  }
  const where = and(...filters);
  const order =
    q.sort === 'hits'
      ? [desc(redirects.hits), desc(redirects.createdAt)]
      : q.sort === 'from'
        ? [asc(redirects.fromPath)]
        : [desc(redirects.createdAt), asc(redirects.fromPath)];
  const [items, [count]] = await Promise.all([
    db
      .select()
      .from(redirects)
      .where(where)
      .orderBy(...order)
      .limit(q.perPage)
      .offset((q.page - 1) * q.perPage),
    db.select({ total: sql<number>`count(*)::int` }).from(redirects).where(where),
  ]);
  return { items, total: count?.total ?? 0, page: q.page, perPage: q.perPage };
}

export async function getRedirect(siteId: string, id: string): Promise<Redirect | null> {
  const [row] = await db
    .select()
    .from(redirects)
    .where(and(eq(redirects.siteId, siteId), eq(redirects.id, id)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export async function createRedirect(ctx: AdminContext, input: unknown): Promise<Redirect> {
  assertCan(ctx, 'settings:manage');
  const data = redirectInputSchema.parse(input);
  await assertUnique(ctx.site.id, data.fromPath);
  await assertNoLoop(ctx.site.id, data.fromPath, data.toPath);
  const [row] = await db
    .insert(redirects)
    .values({ siteId: ctx.site.id, fromPath: data.fromPath, toPath: data.toPath, statusCode: data.statusCode })
    .returning();
  if (!row) throw new ConflictError('Kunne ikke opprette omdirigeringen.');
  await auditFromContext(ctx, {
    action: 'redirect.create',
    entityType: 'redirect',
    entityId: row.id,
    summary: `Opprettet omdirigering ${row.fromPath} → ${row.toPath}`,
    data: { fromPath: row.fromPath, toPath: row.toPath, statusCode: row.statusCode },
  });
  revalidatePublic(ctx.site.id);
  return row;
}

export async function updateRedirect(ctx: AdminContext, id: unknown, input: unknown): Promise<Redirect> {
  assertCan(ctx, 'settings:manage');
  const redirectId = uuidSchema.parse(id);
  const data = redirectInputSchema.parse(input);
  const existing = await getRedirect(ctx.site.id, redirectId);
  if (!existing) throw new NotFoundError('Fant ikke omdirigeringen.');
  await assertUnique(ctx.site.id, data.fromPath, redirectId);
  await assertNoLoop(ctx.site.id, data.fromPath, data.toPath, redirectId);
  const [row] = await db
    .update(redirects)
    .set({ fromPath: data.fromPath, toPath: data.toPath, statusCode: data.statusCode })
    .where(and(eq(redirects.siteId, ctx.site.id), eq(redirects.id, redirectId)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke omdirigeringen.');
  await auditFromContext(ctx, {
    action: 'redirect.update',
    entityType: 'redirect',
    entityId: row.id,
    summary: `Endret omdirigering ${row.fromPath} → ${row.toPath}`,
    data: {
      before: { fromPath: existing.fromPath, toPath: existing.toPath, statusCode: existing.statusCode },
      after: { fromPath: row.fromPath, toPath: row.toPath, statusCode: row.statusCode },
    },
  });
  revalidatePublic(ctx.site.id);
  return row;
}

export async function deleteRedirect(ctx: AdminContext, id: unknown): Promise<void> {
  assertCan(ctx, 'settings:manage');
  const redirectId = uuidSchema.parse(id);
  const [row] = await db
    .delete(redirects)
    .where(and(eq(redirects.siteId, ctx.site.id), eq(redirects.id, redirectId)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke omdirigeringen.');
  await auditFromContext(ctx, {
    action: 'redirect.delete',
    entityType: 'redirect',
    entityId: row.id,
    summary: `Slettet omdirigering ${row.fromPath} → ${row.toPath}`,
    data: { fromPath: row.fromPath, toPath: row.toPath, hits: row.hits },
  });
  revalidatePublic(ctx.site.id);
}

/* -------------------------------------------------------------------------- */
/*  CSV import                                                                 */
/* -------------------------------------------------------------------------- */

export type CsvRow = { line: number; fromPath: string; toPath: string; statusCode: RedirectStatusCode };
export type CsvIssue = { line: number; message: string };

const HEADER_WORDS = new Set(['from', 'fra', 'frompath', 'from_path', 'kilde', 'source', 'old', 'gammel']);

/**
 * Parse "fromPath,toPath[,statusCode]" lines (comma, semicolon or tab
 * separated; a header row and #-comments are skipped). Invalid lines are
 * reported, not thrown.
 */
export function parseRedirectCsv(text: string): { rows: CsvRow[]; issues: CsvIssue[] } {
  const rows: CsvRow[] = [];
  const issues: CsvIssue[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const cells = trimmed
      .split(/\t|;|,/)
      .map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
      .filter((c, i) => i < 3 || c !== '');
    const first = cells[0]?.toLowerCase().replace(/[^a-z_]/g, '') ?? '';
    if (index === 0 && HEADER_WORDS.has(first)) return;
    if (cells.length < 2) {
      issues.push({ line, message: 'Mangler til-sti (forventet «fra,til[,status]»)' });
      return;
    }
    const parsed = redirectInputSchema.safeParse({
      fromPath: cells[0],
      toPath: cells[1],
      statusCode: cells[2] && cells[2] !== '' ? cells[2] : 301,
    });
    if (!parsed.success) {
      issues.push({ line, message: parsed.error.issues[0]?.message ?? 'Ugyldig linje' });
      return;
    }
    rows.push({ line, ...parsed.data });
  });
  return { rows, issues };
}

export type ImportResult = { created: number; updated: number; issues: CsvIssue[] };

/** Import parsed CSV rows: new fromPaths are created, existing ones updated, loops and duplicates reported. */
export async function importRedirects(ctx: AdminContext, text: unknown): Promise<ImportResult> {
  assertCan(ctx, 'settings:manage');
  const csv = z.string().max(500_000, 'For mye data (maks 500 kB)').parse(text ?? '');
  const { rows, issues } = parseRedirectCsv(csv);
  if (rows.length === 0 && issues.length === 0) {
    throw new ActionError('Ingen linjer å importere.', 'validation');
  }

  const result = await db.transaction(async (tx) => {
    let created = 0;
    let updated = 0;
    const existing = await tx
      .select({ id: redirects.id, fromPath: redirects.fromPath, toPath: redirects.toPath })
      .from(redirects)
      .where(eq(redirects.siteId, ctx.site.id));
    const byFrom = new Map(existing.map((r) => [r.fromPath, r]));
    const seenInFile = new Set<string>();

    for (const row of rows) {
      if (seenInFile.has(row.fromPath)) {
        issues.push({ line: row.line, message: `«${row.fromPath}» finnes flere ganger i importen` });
        continue;
      }
      seenInFile.add(row.fromPath);
      const current = byFrom.get(row.fromPath);
      if (createsLoop(row.fromPath, row.toPath, byFrom.values(), current?.id)) {
        issues.push({ line: row.line, message: `«${row.fromPath}» ville skapt en løkke` });
        continue;
      }
      if (current) {
        await tx
          .update(redirects)
          .set({ toPath: row.toPath, statusCode: row.statusCode })
          .where(eq(redirects.id, current.id));
        byFrom.set(row.fromPath, { ...current, toPath: row.toPath });
        updated += 1;
      } else {
        const [inserted] = await tx
          .insert(redirects)
          .values({
            siteId: ctx.site.id,
            fromPath: row.fromPath,
            toPath: row.toPath,
            statusCode: row.statusCode,
          })
          .returning({ id: redirects.id });
        if (inserted) byFrom.set(row.fromPath, { id: inserted.id, fromPath: row.fromPath, toPath: row.toPath });
        created += 1;
      }
    }
    return { created, updated };
  });

  if (result.created + result.updated > 0) {
    await auditFromContext(ctx, {
      action: 'redirect.import',
      entityType: 'redirect',
      summary: `Importerte omdirigeringer (${result.created} nye, ${result.updated} oppdaterte, ${issues.length} hoppet over)`,
      data: { created: result.created, updated: result.updated, skipped: issues.length },
    });
    revalidatePublic(ctx.site.id);
  }
  return { ...result, issues: issues.sort((a, b) => a.line - b.line) };
}
