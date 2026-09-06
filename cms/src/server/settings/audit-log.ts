/**
 * Audit log viewer queries (/admin/logg): filtered, paginated listing of
 * `audit_log` joined with the acting user, plus pure helpers that turn an
 * entry into a Norwegian one-liner and an admin link when the entity is
 * something the admin can open (article → editor, media → media detail …).
 */
import { and, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { auditLog, users, type AuditEntry } from '@/db/schema';
import { adminPaths } from '@/config/routes';
import { uuidSchema } from '@/lib/validation/common';

export const AUDIT_PAGE_SIZES = [25, 50, 100] as const;

const optionalDate = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.date({ error: 'Ugyldig dato' }).optional(),
);

export const auditLogFilterSchema = z.object({
  userId: z.preprocess((v) => (v === '' ? undefined : v), uuidSchema.optional()),
  /** Dotted action prefix, e.g. "article" or "article.publish". */
  action: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9_.-]*$/i, 'Ugyldig handling')
    .optional(),
  entityType: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/i, 'Ugyldig type')
    .optional(),
  from: optionalDate,
  to: optionalDate,
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditLogFilter = z.output<typeof auditLogFilterSchema>;
export type AuditLogFilterInput = z.input<typeof auditLogFilterSchema>;

export type AuditRow = AuditEntry & {
  user: { id: string; name: string; email: string } | null;
};

export type AuditPage = { items: AuditRow[]; total: number; page: number; perPage: number };

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Entries for a site. Superadmins also see installation-wide entries that
 * carry no site (site creation, deletion), everyone else only their site.
 */
export async function listAuditLog(
  siteId: string,
  filterInput: unknown = {},
  opts: { includeGlobal?: boolean } = {},
): Promise<AuditPage> {
  const f = auditLogFilterSchema.parse(filterInput ?? {});
  const clauses: SQL[] = [
    opts.includeGlobal
      ? (or(eq(auditLog.siteId, siteId), isNull(auditLog.siteId)) as SQL)
      : eq(auditLog.siteId, siteId),
  ];
  if (f.userId) clauses.push(eq(auditLog.userId, f.userId));
  if (f.action) clauses.push(sql`${auditLog.action} LIKE ${`${f.action}%`}`);
  if (f.entityType) clauses.push(eq(auditLog.entityType, f.entityType));
  if (f.from) clauses.push(gte(auditLog.createdAt, f.from));
  if (f.to) clauses.push(lte(auditLog.createdAt, f.to));
  if (f.q) {
    const pattern = likePattern(f.q);
    clauses.push(
      or(
        ilike(auditLog.summary, pattern),
        ilike(auditLog.action, pattern),
        sql`${auditLog.entityId}::text ILIKE ${pattern}`,
      ) as SQL,
    );
  }
  const where = and(...clauses);
  const [items, [count]] = await Promise.all([
    db
      .select({
        entry: auditLog,
        user: { id: users.id, name: users.name, email: users.email },
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(where)
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(f.perPage)
      .offset((f.page - 1) * f.perPage),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
  ]);
  return {
    items: items.map((r) => ({ ...r.entry, user: r.user && r.user.id ? r.user : null })),
    total: count?.total ?? 0,
    page: f.page,
    perPage: f.perPage,
  };
}

/** Users that appear in the site's log (for the filter dropdown). */
export async function listAuditUsers(siteId: string): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(auditLog)
    .innerJoin(users, eq(auditLog.userId, users.id))
    .where(eq(auditLog.siteId, siteId))
    .orderBy(users.name);
  return rows;
}

/** Distinct entity types and top-level action prefixes present in the site's log. */
export async function listAuditFacets(
  siteId: string,
): Promise<{ entityTypes: string[]; actionPrefixes: string[] }> {
  const rows = await db
    .selectDistinct({ action: auditLog.action, entityType: auditLog.entityType })
    .from(auditLog)
    .where(eq(auditLog.siteId, siteId));
  const entityTypes = new Set<string>();
  const prefixes = new Set<string>();
  for (const r of rows) {
    if (r.entityType) entityTypes.add(r.entityType);
    const prefix = r.action.split('.')[0];
    if (prefix) prefixes.add(prefix);
  }
  return {
    entityTypes: [...entityTypes].sort(),
    actionPrefixes: [...prefixes].sort(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Norwegian labels for the action prefix (entity family). */
export const AUDIT_PREFIX_LABELS: Record<string, string> = {
  article: 'Sak',
  auth: 'Innlogging',
  user: 'Bruker',
  media: 'Media',
  section: 'Seksjon',
  tag: 'Stikkord',
  author: 'Skribent',
  content_type: 'Innholdstype',
  layout: 'Forside',
  live: 'Direkte',
  live_blog: 'Direkte',
  settings: 'Innstillinger',
  menu: 'Meny',
  redirect: 'Omdirigering',
  site: 'Nettsted',
  api_key: 'API-nøkkel',
  webhook: 'Webhook',
  note: 'Notat',
  plan: 'Redaksjonsplan',
};

/** Verb labels for the last segment of an action name. */
const VERB_LABELS: Record<string, string> = {
  create: 'opprettet',
  update: 'endret',
  delete: 'slettet',
  destroy: 'slettet permanent',
  publish: 'publiserte',
  unpublish: 'avpubliserte',
  schedule: 'planla',
  trash: 'la i papirkurven',
  restore: 'gjenopprettet',
  archive: 'arkiverte',
  approve: 'godkjente',
  review: 'sendte til desk',
  transition: 'endret status for',
  login: 'logget inn',
  logout: 'logget ut',
  login_failed: 'mislyktes med innlogging',
  password_reset: 'tilbakestilte passord',
  password_change: 'byttet passord',
  invite: 'inviterte',
  accept_invite: 'godtok invitasjon',
  revoke: 'trakk tilbake',
  import: 'importerte',
  reorder: 'endret rekkefølge på',
  upload: 'lastet opp',
  assign: 'tildelte',
  lock_takeover: 'overtok redigeringen av',
  totp_enable: 'skrudde på totrinnsbekreftelse',
  totp_disable: 'skrudde av totrinnsbekreftelse',
  deactivate: 'deaktiverte',
  activate: 'aktiverte',
  send: 'sendte',
  retry: 'sendte på nytt',
  reset: 'tilbakestilte',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Human-readable one-liner for an entry: the stored summary when present,
 * otherwise "Endret sak" style text derived from the action name.
 */
export function describeAuditEntry(
  entry: Pick<AuditEntry, 'action' | 'summary' | 'entityType' | 'entityId'>,
): string {
  if (entry.summary && entry.summary.trim()) return entry.summary.trim();
  const [prefix = '', ...rest] = entry.action.split('.');
  const verb = rest[rest.length - 1] ?? '';
  const verbLabel = VERB_LABELS[verb];
  const noun = AUDIT_PREFIX_LABELS[prefix] ?? AUDIT_PREFIX_LABELS[entry.entityType ?? ''] ?? prefix;
  if (verbLabel && noun) {
    const text = `${verbLabel} ${noun.toLowerCase()}`;
    return capitalize(entry.entityId ? `${text} ${entry.entityId.slice(0, 8)}` : text);
  }
  return entry.action;
}

/** Admin URL for the entity an entry refers to, when the admin has a page for it. */
export function auditEntityLink(
  entry: Pick<AuditEntry, 'entityType' | 'entityId' | 'action'>,
): string | null {
  const id = entry.entityId;
  const type = entry.entityType ?? entry.action.split('.')[0] ?? '';
  if (entry.action.endsWith('.delete') || entry.action.endsWith('.destroy')) return null;
  switch (type) {
    case 'article':
      return id ? adminPaths.article(id) : adminPaths.articles();
    case 'media':
      return id ? adminPaths.mediaItem(id) : adminPaths.media();
    case 'live_blog':
    case 'live':
      return id ? adminPaths.liveBlog(id) : adminPaths.live();
    case 'layout':
      return adminPaths.front();
    case 'section':
      return adminPaths.sections();
    case 'tag':
      return adminPaths.tags();
    case 'author':
      return adminPaths.authors();
    case 'content_type':
      return adminPaths.contentTypes();
    case 'user':
      return adminPaths.users();
    case 'site':
      return adminPaths.settings();
    case 'menu':
      return adminPaths.settings('menyer');
    case 'redirect':
      return adminPaths.settings('omdirigeringer');
    case 'api_key':
      return adminPaths.settings('api');
    case 'webhook':
      return adminPaths.settings('webhooks');
    default:
      return null;
  }
}

/** Badge tone for the list: red for destructive actions, green for publish, blue for the rest. */
export function auditTone(action: string): 'danger' | 'success' | 'warning' | 'default' {
  if (/\.(delete|destroy|revoke|login_failed|deactivate)$/.test(action)) return 'danger';
  if (/\.(publish|create|accept_invite|activate)$/.test(action)) return 'success';
  if (/\.(unpublish|trash|lock_takeover)$/.test(action)) return 'warning';
  return 'default';
}
