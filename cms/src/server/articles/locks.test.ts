import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articles, type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { acquireLock, getLockState, heartbeatLock, isLockStale, LOCK_STALE_MS, releaseLock } from './locks';

let db: Db;
let seed: SeedMinimalResult;
let articleId: string;

function ctxFor(user: User, role: MemberRole): AdminContext {
  return {
    user,
    site: seed.site,
    settings: parseSiteSettings(seed.site.settings),
    role,
    sites: [seed.site],
    locale: 'nb',
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip: null,
    sessionId: 'test-session',
  };
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      title: 'Låst sak',
      slug: 'last-sak',
      createdBy: seed.contributor.id,
    })
    .returning({ id: articles.id });
  articleId = row!.id;
});

describe('edit locks', () => {
  it('only lets people who may edit the article lock it', async () => {
    const contributor = ctxFor(seed.contributor, 'contributor');
    const viewer = ctxFor(seed.journalist, 'viewer');
    const [other] = await db
      .insert(articles)
      .values({
        siteId: seed.site.id,
        contentTypeId: seed.contentType.id,
        title: 'Redaktørens sak',
        slug: 'redaktorens-sak',
        createdBy: seed.editor.id,
      })
      .returning({ id: articles.id });
    // Someone else's article: a contributor cannot park a lock on it, a viewer cannot lock anything.
    await expect(acquireLock(contributor, other!.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(acquireLock(viewer, other!.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(acquireLock(viewer, articleId)).rejects.toMatchObject({ code: 'forbidden' });
    const [row] = await db
      .select({ lockedBy: articles.lockedBy })
      .from(articles)
      .where(eq(articles.id, other!.id));
    expect(row!.lockedBy).toBeNull();
    // Their own article is fine.
    expect(await acquireLock(contributor, articleId)).toEqual({ ok: true });
  });

  it('acquires a free lock, refuses others while fresh, and heartbeats', async () => {
    const editor = ctxFor(seed.editor, 'editor');
    const journalist = ctxFor(seed.journalist, 'journalist');

    expect(await acquireLock(editor, articleId)).toEqual({ ok: true });
    const mine = await getLockState(editor, articleId);
    expect(mine).toMatchObject({
      mine: true,
      stale: false,
      lockedBy: { id: seed.editor.id, name: seed.editor.name },
    });

    const denied = await acquireLock(journalist, articleId);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.lockedBy).toEqual({ id: seed.editor.id, name: seed.editor.name });

    const theirs = await getLockState(journalist, articleId);
    expect(theirs).toMatchObject({ mine: false, stale: false, canTakeOver: true }); // journalists hold article:edit_any

    // Heartbeat moves the timestamp forward; someone else's heartbeat does nothing.
    const before = (
      await db.select({ at: articles.lockedAt }).from(articles).where(eq(articles.id, articleId))
    )[0]!.at!;
    const later = new Date(before.getTime() + 10_000);
    const afterMine = await heartbeatLock(editor, articleId, later);
    expect(afterMine.mine).toBe(true);
    expect(afterMine.lockedAt?.getTime()).toBe(later.getTime());
    const afterTheirs = await heartbeatLock(journalist, articleId, new Date(later.getTime() + 5_000));
    expect(afterTheirs.mine).toBe(false);
    expect(
      (
        await db.select({ at: articles.lockedAt }).from(articles).where(eq(articles.id, articleId))
      )[0]!.at!.getTime(),
    ).toBe(later.getTime());
  });

  it('lets anyone take a stale lock (no heartbeat for 90 s)', async () => {
    const editor = ctxFor(seed.editor, 'editor');
    const contributor = ctxFor(seed.contributor, 'contributor');
    await acquireLock(editor, articleId);
    expect((await acquireLock(contributor, articleId)).ok).toBe(false);

    const stale = new Date(Date.now() - LOCK_STALE_MS - 1000);
    await db.update(articles).set({ lockedAt: stale }).where(eq(articles.id, articleId));
    expect(isLockStale(stale)).toBe(true);
    const state = await getLockState(contributor, articleId);
    expect(state).toMatchObject({ stale: true, canTakeOver: true });

    expect(await acquireLock(contributor, articleId)).toEqual({ ok: true });
    expect((await getLockState(contributor, articleId)).mine).toBe(true);
    // The previous holder now sees someone else's fresh lock.
    expect((await acquireLock(editor, articleId)).ok).toBe(false);
  });

  it('allows explicit takeover only for users with article:edit_any', async () => {
    const editor = ctxFor(seed.editor, 'editor');
    const admin = ctxFor(seed.admin, 'admin');
    const contributor = ctxFor(seed.contributor, 'contributor');
    await acquireLock(editor, articleId);

    expect((await acquireLock(contributor, articleId, { takeover: true })).ok).toBe(false);
    expect((await acquireLock(admin, articleId, { takeover: true })).ok).toBe(true);
    expect((await getLockState(admin, articleId)).mine).toBe(true);
    expect((await getLockState(editor, articleId)).mine).toBe(false);
  });

  it('releases only my own lock', async () => {
    const editor = ctxFor(seed.editor, 'editor');
    const journalist = ctxFor(seed.journalist, 'journalist');
    await acquireLock(editor, articleId);
    await releaseLock(journalist, articleId);
    expect((await getLockState(editor, articleId)).mine).toBe(true);
    await releaseLock(editor, articleId);
    expect(await getLockState(editor, articleId)).toMatchObject({ lockedBy: null, mine: false });
    expect(await acquireLock(journalist, articleId)).toEqual({ ok: true });
  });
});
