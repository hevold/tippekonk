import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { auditLog, livePosts, webhookDeliveries, webhooks, type MemberRole, type User } from '@/db/schema';
import type { ContentDoc } from '@/lib/content/types';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  addPost,
  createLiveBlog,
  deletePost,
  getPublicLiveBlog,
  listLiveBlogs,
  listPostsAfter,
  setLiveBlogStatus,
  updateLiveBlog,
  updatePost,
} from './index';

let db: Db;
let seed: SeedMinimalResult;

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

const para = (text: string): ContentDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('live blogs', () => {
  it('creates a blog with a transliterated unique slug and starts it', async () => {
    const ctx = ctxFor(seed.journalist, 'journalist');
    const blog = await createLiveBlog(ctx, { title: 'Kommunestyret – direkte!' });
    expect(blog.slug).toBe('kommunestyret-direkte');
    expect(blog.status).toBe('draft');
    const second = await createLiveBlog(ctx, { title: 'Kommunestyret direkte' });
    expect(second.slug).toBe('kommunestyret-direkte-2');
    await expect(
      updateLiveBlog(ctx, second.id, { title: 'x', slug: 'kommunestyret-direkte' }),
    ).rejects.toThrow(/i bruk/);

    expect(await getPublicLiveBlog(seed.site.id, blog.slug)).toBeNull(); // drafts are private
    const started = await setLiveBlogStatus(ctx, blog.id, 'live');
    expect(started.startedAt).toBeInstanceOf(Date);
    await expect(setLiveBlogStatus(ctx, blog.id, 'draft')).rejects.toThrow();
    const list = await listLiveBlogs(seed.site.id);
    expect(list[0]!.id).toBe(blog.id); // live first
  });

  it('adds posts, enqueues webhooks, orders pinned first and lists key events', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    await db.insert(webhooks).values({
      siteId: seed.site.id,
      name: 'h',
      url: 'https://example.com',
      secret: 's',
      events: ['live.post_created'],
      isActive: true,
    });
    const blog = await createLiveBlog(ctx, { title: 'Valgnatt', status: 'live' });
    await expect(addPost(ctx, { liveBlogId: blog.id, body: { type: 'doc', content: [] } })).rejects.toThrow();
    const first = await addPost(ctx, {
      liveBlogId: blog.id,
      body: para('Første'),
      authorId: seed.authors.editor.id,
      publishedAt: new Date(Date.now() - 3000),
    });
    const key = await addPost(ctx, {
      liveBlogId: blog.id,
      title: 'Resultatet er klart',
      body: para('Nøkkel'),
      isKeyEvent: true,
      publishedAt: new Date(Date.now() - 2000),
    });
    const pinned = await addPost(ctx, {
      liveBlogId: blog.id,
      body: para('Festet'),
      isPinned: true,
      publishedAt: new Date(Date.now() - 4000),
    });
    expect(first.authorName).toBe(seed.editor.name);

    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries).toHaveLength(3);
    expect(deliveries.every((d) => d.event === 'live.post_created')).toBe(true);

    const page = await getPublicLiveBlog(seed.site.id, blog.slug);
    expect(page?.posts.map((p) => p.id)).toEqual([pinned.id, key.id, first.id]);
    expect(page?.keyEvents.map((p) => p.id)).toEqual([key.id]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'live.post_create'));
    expect(audits).toHaveLength(3);
  });

  it('reports created, edited and deleted posts since an instant', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    const blog = await createLiveBlog(ctx, { title: 'Brann', status: 'live' });
    const a = await addPost(ctx, { liveBlogId: blog.id, body: para('A') });
    const b = await addPost(ctx, { liveBlogId: blog.id, body: para('B') });
    const all = await listPostsAfter(blog.id, null);
    expect(all.posts.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    expect(all.deleted).toEqual([]);

    const since = new Date();
    await new Promise((r) => setTimeout(r, 15));
    await updatePost(ctx, { id: a.id, title: 'Endret' });
    await deletePost(ctx, b.id);
    const c = await addPost(ctx, { liveBlogId: blog.id, body: para('C') });
    const delta = await listPostsAfter(blog.id, since);
    expect(delta.posts.map((p) => p.id).sort()).toEqual([a.id, c.id].sort());
    expect(delta.posts.find((p) => p.id === a.id)?.title).toBe('Endret');
    expect(delta.deleted).toEqual([b.id]);
    expect(delta.status).toBe('live');

    await expect(
      updatePost(ctx, { id: a.id, title: null, body: { type: 'doc', content: [] } }),
    ).rejects.toThrow(/tomt/);
    const rows = await db.select().from(livePosts).where(eq(livePosts.id, b.id));
    expect(rows[0]!.deletedAt).toBeInstanceOf(Date);
  });

  it('ends a blog and keeps the public page readable', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    const blog = await createLiveBlog(ctx, { title: 'Slutt', status: 'live' });
    await addPost(ctx, { liveBlogId: blog.id, body: para('Hei') });
    const ended = await setLiveBlogStatus(ctx, blog.id, 'ended');
    expect(ended.endedAt).toBeInstanceOf(Date);
    const page = await getPublicLiveBlog(seed.site.id, blog.slug);
    expect(page?.blog.status).toBe('ended');
    expect(page?.posts).toHaveLength(1);
  });
});
