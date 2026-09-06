/**
 * Redirect lookup for the public article route (SPEC 5.3): when a path 404s
 * we consult the `redirects` table before giving up.
 *
 * INTEGRATION: the settings area owns `resolveRedirect` in
 * '@/server/redirects'. This module wraps it when present and otherwise
 * falls back to a direct lookup on the table (same semantics: exact
 * from_path match per site, hit counter incremented), so the public site
 * works either way. Switch `findRedirect` to import it directly once the
 * settings area's module has landed.
 */
import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { redirects } from '@/db/schema';

export type ResolvedRedirect = { toPath: string; statusCode: 301 | 302 | 307 | 308 };

/** Normalise a request path for matching: leading slash, no trailing slash, no query. */
export function normalizeRedirectPath(path: string): string {
  let p = path.split('?')[0]?.split('#')[0] ?? '/';
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    // Keep the raw path when it is not valid percent-encoding.
  }
  return p;
}

function statusOf(code: number): ResolvedRedirect['statusCode'] {
  return code === 302 || code === 307 || code === 308 ? code : 301;
}

/** Exact-path redirect for the site, or null. Increments the hit counter (best-effort). */
export async function findRedirect(siteId: string, path: string): Promise<ResolvedRedirect | null> {
  const fromPath = normalizeRedirectPath(path);
  const [row] = await db
    .select({ id: redirects.id, toPath: redirects.toPath, statusCode: redirects.statusCode })
    .from(redirects)
    .where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, fromPath)))
    .limit(1);
  if (!row) return null;
  if (normalizeRedirectPath(row.toPath) === fromPath) return null; // never loop onto itself
  db.update(redirects)
    .set({ hits: sql`${redirects.hits} + 1` })
    .where(eq(redirects.id, row.id))
    .then(() => undefined)
    .catch((err: unknown) => console.error('[public] redirect hit counter', err));
  return { toPath: row.toPath, statusCode: statusOf(row.statusCode) };
}
