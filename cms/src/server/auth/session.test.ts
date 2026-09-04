import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessions, users } from '@/db/schema';
import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

import { SESSION_RENEW_BELOW_MS, SESSION_TTL_MS } from './cookies';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));

const sessionModule = await import('./session');
const { deleteUserSessions, issueSession, listUserSessions, markSessionMfaVerified, resolveSession } =
  sessionModule;

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('sessions', () => {
  it('issues a session and resolves it by raw token', async () => {
    const { raw, session } = await issueSession(seed.editor.id, { ip: '10.0.0.1', userAgent: 'vitest' });
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.mfaVerified).toBe(false);
    const stored = await db.select().from(sessions).where(eq(sessions.id, session.id));
    expect(stored[0]?.tokenHash).not.toBe(raw);

    const resolved = await resolveSession(raw);
    expect(resolved?.user.id).toBe(seed.editor.id);
    expect(resolved?.session.id).toBe(session.id);
    expect(resolved?.renewed).toBe(false);
  });

  it('rejects unknown, expired and inactive sessions', async () => {
    expect(await resolveSession('nope')).toBeNull();
    expect(await resolveSession(null)).toBeNull();

    const { raw, session } = await issueSession(seed.journalist.id);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, session.id));
    expect(await resolveSession(raw)).toBeNull();
    // Expired rows are removed.
    expect(await db.select().from(sessions).where(eq(sessions.id, session.id))).toHaveLength(0);

    const { raw: raw2 } = await issueSession(seed.journalist.id);
    await db.update(users).set({ isActive: false }).where(eq(users.id, seed.journalist.id));
    expect(await resolveSession(raw2)).toBeNull();
  });

  it('renews sliding expiry when fewer than 15 days remain', async () => {
    const { raw, session } = await issueSession(seed.editor.id);
    const soon = new Date(Date.now() + SESSION_RENEW_BELOW_MS - 60_000);
    await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.id, session.id));
    const resolved = await resolveSession(raw);
    expect(resolved?.renewed).toBe(true);
    const expected = Date.now() + SESSION_TTL_MS;
    expect(Math.abs((resolved?.session.expiresAt.getTime() ?? 0) - expected)).toBeLessThan(5000);
  });

  it('marks mfa verified and deletes sessions except the current one', async () => {
    const a = await issueSession(seed.admin.id);
    const b = await issueSession(seed.admin.id);
    await markSessionMfaVerified(a.session.id);
    expect((await resolveSession(a.raw))?.session.mfaVerified).toBe(true);
    const removed = await deleteUserSessions(seed.admin.id, a.session.id);
    expect(removed).toBe(1);
    expect(await resolveSession(b.raw)).toBeNull();
    expect(await listUserSessions(seed.admin.id)).toHaveLength(1);
  });
});
