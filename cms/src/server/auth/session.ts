/**
 * Sessions: an opaque 32-byte token in the `desken_session` cookie, stored
 * as a SHA-256 hash in `sessions`. 30-day lifetime with sliding renewal once
 * fewer than 15 days remain. Sessions carry `mfaVerified` so a user with TOTP
 * enabled can be parked on /admin/2fa until the second factor is done.
 *
 * Pure service functions (`issueSession`, `resolveSession`, …) take and return
 * plain values so they are testable without Next.js; the cookie-bound helpers
 * (`getSession`, `createSession`, `destroySession`) are thin adapters used by
 * server components, server actions and route handlers.
 */
import 'server-only';

import { and, desc, eq, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { db } from '@/db';
import { sessions, users, type Session, type User } from '@/db/schema';
import { env } from '@/env';

import {
  SESSION_COOKIE,
  SESSION_RENEW_BELOW_MS,
  SESSION_TTL_MS,
  SITE_COOKIE,
  sessionCookieOptions,
} from './cookies';
import { randomToken, sha256Hex } from './crypto';

export { SESSION_COOKIE, SITE_COOKIE };

export type SessionWithUser = { user: User; session: Session };

/** Only touch `lastSeenAt` this often to avoid a write on every request. */
const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

/* -------------------------------------------------------------------------- */
/*  Pure service                                                               */
/* -------------------------------------------------------------------------- */

export type IssueSessionOptions = {
  mfaVerified?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  now?: Date;
};

/** Create a session row and return the raw token that goes into the cookie. */
export async function issueSession(
  userId: string,
  opts: IssueSessionOptions = {},
): Promise<{ raw: string; session: Session }> {
  const now = opts.now ?? new Date();
  const raw = randomToken(32);
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: sha256Hex(raw),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      mfaVerified: opts.mfaVerified ?? false,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ? opts.userAgent.slice(0, 400) : null,
      lastSeenAt: now,
      createdAt: now,
    })
    .returning();
  if (!session) throw new Error('Kunne ikke opprette økt.');
  return { raw, session };
}

export type ResolveResult = SessionWithUser & { renewed: boolean };

/**
 * Validate a raw cookie token: the row must exist, not be expired, and the
 * user must be active. Extends the expiry when fewer than 15 days remain and
 * refreshes `lastSeenAt` at most every five minutes.
 */
export async function resolveSession(
  raw: string | null | undefined,
  now: Date = new Date(),
): Promise<ResolveResult | null> {
  if (!raw || raw.length < 20 || raw.length > 200) return null;
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, sha256Hex(raw)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  if (!row.user.isActive) return null;

  const remaining = row.session.expiresAt.getTime() - now.getTime();
  const renewed = remaining < SESSION_RENEW_BELOW_MS;
  const touch = now.getTime() - row.session.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS;
  if (renewed || touch) {
    const patch: Partial<Session> = { lastSeenAt: now };
    if (renewed) patch.expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await db.update(sessions).set(patch).where(eq(sessions.id, row.session.id));
    row.session = { ...row.session, ...patch };
  }
  return { user: row.user, session: row.session, renewed };
}

export async function deleteSessionByToken(raw: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(raw)));
}

export async function deleteSessionById(userId: string, sessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));
}

/** Log a user out everywhere; keep one session (the caller's) when `exceptSessionId` is given. */
export async function deleteUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  const rows = await db.delete(sessions).where(where).returning({ id: sessions.id });
  return rows.length;
}

export async function listUserSessions(userId: string): Promise<Session[]> {
  return db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt));
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  await db.update(sessions).set({ mfaVerified: true }).where(eq(sessions.id, sessionId));
}

/* -------------------------------------------------------------------------- */
/*  Next.js adapters (cookie-bound)                                            */
/* -------------------------------------------------------------------------- */

/** Raw token from the request cookie, if any. */
export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

async function setSessionCookie(raw: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, sessionCookieOptions(env.APP_URL));
}

/**
 * The current session, memoised per request. Returns null when there is no
 * valid session. When the session was renewed and we are in a context that
 * may set cookies (server action / route handler) the cookie is refreshed too.
 */
export const getSession = cache(async (): Promise<SessionWithUser | null> => {
  const raw = await readSessionCookie();
  const result = await resolveSession(raw);
  if (!result) return null;
  if (result.renewed && raw) {
    try {
      await setSessionCookie(raw);
    } catch {
      // Server components cannot set cookies; the DB row is renewed and the
      // cookie gets refreshed on the next action or login.
    }
  }
  return { user: result.user, session: result.session };
});

export type CreateSessionOptions = { mfaVerified?: boolean; ip?: string | null; userAgent?: string | null };

/** Create a session for `userId` and set the cookie. Server actions and route handlers only. */
export async function createSession(userId: string, opts: CreateSessionOptions = {}): Promise<Session> {
  const { raw, session } = await issueSession(userId, opts);
  await setSessionCookie(raw);
  return session;
}

/** Delete the current session row and clear the cookie. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      await deleteSessionByToken(raw);
    } catch (err) {
      console.error('[auth] Kunne ikke slette økt', err);
    }
  }
  jar.delete(SESSION_COOKIE);
}
