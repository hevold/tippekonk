import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articleRevisions, articles, authTokens, sessions, webhookDeliveries, webhooks } from '@/db/schema';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  deleteExpiredSessions,
  deleteExpiredTokens,
  publishDueArticles,
  releaseStaleLocks,
  tick,
} from './index';

let db: Db;
let seed: SeedMinimalResult;

async function insertScheduled(title: string, at: Date) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      sectionId: seed.section.id,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      status: 'scheduled',
      scheduledAt: at,
      createdBy: seed.journalist.id,
      updatedBy: seed.editor.id,
      version: 3,
    })
    .returning();
  return row!;
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('scheduler', () => {
  it('publishes due scheduled articles exactly once with a publish revision and webhook', async () => {
    await db.insert(webhooks).values({
      siteId: seed.site.id,
      name: 'h',
      url: 'https://example.com',
      secret: 's',
      events: ['article.published'],
      isActive: true,
    });
    const due = await insertScheduled('Klar sak', new Date(Date.now() - 1000));
    const later = await insertScheduled('Senere sak', new Date(Date.now() + 3_600_000));

    expect(await publishDueArticles()).toBe(1);
    const [published] = await db.select().from(articles).where(eq(articles.id, due.id));
    expect(published!.status).toBe('published');
    expect(published!.publishedAt).toBeInstanceOf(Date);
    expect(published!.firstPublishedAt).toBeInstanceOf(Date);
    expect(published!.scheduledAt).toBeNull();
    expect(published!.version).toBe(4);
    const [untouched] = await db.select().from(articles).where(eq(articles.id, later.id));
    expect(untouched!.status).toBe('scheduled');

    const revisions = await db.select().from(articleRevisions).where(eq(articleRevisions.articleId, due.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.kind).toBe('publish');
    expect(revisions[0]!.version).toBe(4);
    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.event).toBe('article.published');

    // Idempotent: a second run finds nothing.
    expect(await publishDueArticles()).toBe(0);
  });

  it('cleans up sessions, tokens and stale locks and reports a summary', async () => {
    await db.insert(sessions).values([
      { userId: seed.editor.id, tokenHash: 'expired', expiresAt: new Date(Date.now() - 1000) },
      { userId: seed.editor.id, tokenHash: 'valid', expiresAt: new Date(Date.now() + 100_000) },
    ]);
    await db.insert(authTokens).values([
      {
        userId: seed.editor.id,
        kind: 'password_reset',
        tokenHash: 'old',
        expiresAt: new Date(Date.now() - 1000),
      },
      { userId: seed.editor.id, kind: 'invite', tokenHash: 'new', expiresAt: new Date(Date.now() + 100_000) },
    ]);
    const locked = await insertScheduled('Låst sak', new Date(Date.now() + 3_600_000));
    await db
      .update(articles)
      .set({ lockedBy: seed.editor.id, lockedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(articles.id, locked.id));

    expect(await deleteExpiredSessions()).toBe(1);
    expect(await deleteExpiredTokens()).toBe(1);
    expect(await releaseStaleLocks()).toBe(1);
    const [row] = await db.select().from(articles).where(eq(articles.id, locked.id));
    expect(row!.lockedBy).toBeNull();

    const summary = await tick({ fetch: async () => new Response('ok') });
    expect(summary.skipped).toBe(false);
    expect(summary.published).toBe(0);
    expect(summary.expiredSessions).toBe(0);
    expect(typeof summary.durationMs).toBe('number');
  });

  it('skips overlapping runs in the same process', async () => {
    await insertScheduled('A', new Date(Date.now() - 1000));
    const [first, second] = await Promise.all([
      tick({ fetch: async () => new Response('ok') }),
      tick({ fetch: async () => new Response('ok') }),
    ]);
    expect([first.skipped, second.skipped].filter(Boolean)).toHaveLength(1);
    expect(first.published + second.published).toBe(1);
  });
});
