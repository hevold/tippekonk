/**
 * One-time tokens for invitations, password resets, e-mail verification and
 * preview links (`auth_tokens`). Only the SHA-256 of the raw token is stored;
 * the raw value travels in the e-mail link once.
 *
 *   const raw = await createToken('invite', { userId, siteId, ttlMinutes: 72 * 60, meta: { role } });
 *   const row = await consumeToken('invite', raw);   // null when unknown, expired or already used
 *   const row = await peekToken('invite', raw);      // same checks, but does not mark it used
 */
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { authTokens, type AuthToken, type AuthTokenKind } from '@/db/schema';

import { randomToken, sha256Hex } from './crypto';

export function hashToken(raw: string): string {
  return sha256Hex(raw);
}

export type CreateTokenOptions = {
  userId?: string;
  siteId?: string;
  ttlMinutes: number;
  meta?: Record<string, unknown>;
};

/** Insert a token row and return the raw token (base64url, 43 chars). */
export async function createToken(kind: AuthTokenKind, opts: CreateTokenOptions): Promise<string> {
  const raw = randomToken(32);
  await db.insert(authTokens).values({
    kind,
    userId: opts.userId ?? null,
    siteId: opts.siteId ?? null,
    tokenHash: hashToken(raw),
    meta: opts.meta ?? {},
    expiresAt: new Date(Date.now() + Math.max(1, opts.ttlMinutes) * 60_000),
  });
  return raw;
}

/** Look a token up without consuming it (for rendering the accept/reset form). */
export async function peekToken(kind: AuthTokenKind, raw: string): Promise<AuthToken | null> {
  if (!raw || raw.length > 200) return null;
  const rows = await db
    .select()
    .from(authTokens)
    .where(
      and(eq(authTokens.tokenHash, hashToken(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/**
 * Atomically mark the token used and return it. The UPDATE … WHERE used_at IS
 * NULL guarantees single use even under concurrent requests.
 */
export async function consumeToken(kind: AuthTokenKind, raw: string): Promise<AuthToken | null> {
  if (!raw || raw.length > 200) return null;
  const now = new Date();
  const rows = await db
    .update(authTokens)
    .set({ usedAt: now })
    .where(
      and(eq(authTokens.tokenHash, hashToken(raw)), eq(authTokens.kind, kind), isNull(authTokens.usedAt)),
    )
    .returning();
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  return row;
}

/** Invalidate every unused token of a kind for a user (e.g. before re-sending an invitation). */
export async function invalidateTokens(kind: AuthTokenKind, userId: string): Promise<void> {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.kind, kind), eq(authTokens.userId, userId), isNull(authTokens.usedAt)));
}
