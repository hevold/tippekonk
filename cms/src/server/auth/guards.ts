/**
 * Guards for server actions and route handlers.
 *
 *   const ctx = await requirePermission('article:publish');   // ForbiddenError / UnauthorizedError
 *   assertCan(ctx, 'user:manage');
 *   const { site, apiKey } = await requireApiKey(request, 'content:read');   // /api/v1
 *
 * These throw the ActionError subclasses from '@/server/actions' so
 * `runAction()` turns them into ActionResult failures, and route handlers can
 * map them to 401/403.
 */
import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { apiKeys, sites, type ApiKey, type Site } from '@/db/schema';
import type { Permission } from '@/lib/permissions';
import { ForbiddenError, UnauthorizedError } from '@/server/actions';

import { getOptionalAdminContext, resolveAdminState, type AdminContext } from './context';
import { sha256Hex } from './crypto';

export function assertCan(ctx: AdminContext, permission: Permission): void {
  if (!ctx.can(permission)) throw new ForbiddenError();
}

/** Resolve the admin context for an action; throws instead of redirecting. */
export async function requireAdminContext(): Promise<AdminContext> {
  const state = await resolveAdminState();
  if (state.kind === 'ok') return state.ctx;
  if (state.kind === 'anonymous') throw new UnauthorizedError();
  if (state.kind === 'mfa_required') throw new UnauthorizedError('Fullfør totrinnsbekreftelsen først.');
  throw new ForbiddenError('Du er ikke medlem av noen redaksjon.');
}

export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const ctx = await requireAdminContext();
  assertCan(ctx, permission);
  return ctx;
}

/** Same as getOptionalAdminContext, re-exported here for route handlers that want a soft check. */
export { getOptionalAdminContext };

const LAST_USED_INTERVAL_MS = 60_000;

/** Extract the bearer token from an Authorization header (or null). */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length <= 200 ? token : null;
}

/**
 * Authenticate an API request with `Authorization: Bearer <key>`. The key must
 * exist (by SHA-256), not be revoked and belong to an active site. When a
 * scope is given the key must list it (or '*'). `lastUsedAt` is refreshed at
 * most once per minute to keep the hot path cheap.
 */
export async function requireApiKey(
  request: Request,
  scope?: string,
): Promise<{ site: Site; apiKey: ApiKey }> {
  const raw = bearerToken(request);
  if (!raw) throw new UnauthorizedError('Mangler API-nøkkel.');
  const rows = await db
    .select({ apiKey: apiKeys, site: sites })
    .from(apiKeys)
    .innerJoin(sites, eq(apiKeys.siteId, sites.id))
    .where(and(eq(apiKeys.keyHash, sha256Hex(raw)), isNull(apiKeys.revokedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new UnauthorizedError('Ugyldig API-nøkkel.');
  if (!row.site.isActive) throw new ForbiddenError('Nettstedet er deaktivert.');
  if (scope && !row.apiKey.scopes.includes(scope) && !row.apiKey.scopes.includes('*')) {
    throw new ForbiddenError('API-nøkkelen har ikke tilgang til dette.');
  }
  const now = Date.now();
  const last = row.apiKey.lastUsedAt?.getTime() ?? 0;
  if (now - last > LAST_USED_INTERVAL_MS) {
    const stamp = new Date(now);
    db.update(apiKeys)
      .set({ lastUsedAt: stamp })
      .where(eq(apiKeys.id, row.apiKey.id))
      .then(() => undefined)
      .catch((err: unknown) => console.error('[auth] lastUsedAt', err));
    row.apiKey = { ...row.apiKey, lastUsedAt: stamp };
  }
  return { site: row.site, apiKey: row.apiKey };
}
