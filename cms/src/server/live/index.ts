/**
 * Live blogs (direktestudio): blogs with status draft/live/ended and their
 * posts. Posts are ordered newest first, pinned posts on top, and key
 * events ("nøkkelhendelser") are listed in a summary box on the public page.
 *
 *   const blog = await createLiveBlog(ctx, { title: 'Kommunestyret direkte' });
 *   await setLiveBlogStatus(ctx, blog.id, 'live');
 *   const post = await addPost(ctx, { liveBlogId: blog.id, body, isKeyEvent: true });
 *   const page = await getPublicLiveBlog(siteId, 'kommunestyret-direkte');
 *   const delta = await listPostsAfter(blog.id, since);      // polling endpoint
 *
 * Every mutation: permission (checked by the action) → validate → write →
 * audit → cache revalidation (live tag + site) → webhook for new posts.
 */
import 'server-only';

import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  articles,
  authors,
  liveBlogs,
  livePosts,
  media,
  sections,
  type LiveBlog,
  type LiveBlogStatus,
  type LivePost,
  type Media,
} from '@/db/schema';
import { adminPaths, publicPaths } from '@/config/routes';
import { isEmptyDoc, sanitizeDoc } from '@/lib/content/schema';
import { docExcerpt, docMediaIds } from '@/lib/content/text';
import type { ContentDoc } from '@/lib/content/types';
import { slugify, uniqueSlug } from '@/lib/text/slug';
import {
  liveBlogInputSchema,
  livePostInputSchema,
  livePostUpdateSchema,
  type LiveBlogInput,
} from '@/lib/validation/live';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { revalidateLive, revalidatePublic } from '@/server/cache';
import { enqueueWebhookEvent } from '@/server/webhooks';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LiveBlogListItem = LiveBlog & {
  postCount: number;
  lastPostAt: Date | null;
  articleTitle: string | null;
};

export type LivePostView = LivePost & {
  authorName: string | null;
  authorSlug: string | null;
};

/** Serialisable post for client components and the polling endpoint. */
export type LivePostDto = {
  id: string;
  title: string | null;
  body: ContentDoc;
  authorId: string | null;
  authorName: string | null;
  isPinned: boolean;
  isKeyEvent: boolean;
  publishedAt: string;
  updatedAt: string;
};

export type PublicLiveBlog = {
  blog: LiveBlog;
  /** Pinned first, then newest first. */
  posts: LivePostView[];
  /** Key events oldest first (a timeline). */
  keyEvents: LivePostView[];
  /** Media referenced by post bodies, keyed by id. */
  media: Map<string, Media>;
  /** The linked article, when published. */
  article: { id: string; title: string; path: string } | null;
};

export type PostsDelta = {
  posts: LivePostDto[];
  /** Ids of posts deleted since `after`. */
  deleted: string[];
  media: Record<string, Media>;
  status: LiveBlogStatus;
  serverTime: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function toPostDto(post: LivePostView): LivePostDto {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    authorId: post.authorId,
    authorName: post.authorName,
    isPinned: post.isPinned,
    isKeyEvent: post.isKeyEvent,
    publishedAt: post.publishedAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

/** Pinned posts first, then newest first (SPEC 5.7). */
export function sortPosts<T extends Pick<LivePost, 'isPinned' | 'publishedAt' | 'id'>>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const diff = b.publishedAt.getTime() - a.publishedAt.getTime();
    return diff !== 0 ? diff : a.id < b.id ? 1 : -1;
  });
}

async function loadBlog(siteId: string, id: string): Promise<LiveBlog> {
  const [row] = await db
    .select()
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), eq(liveBlogs.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke direktesendingen.');
  return row;
}

async function slugExists(siteId: string, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: liveBlogs.id })
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), eq(liveBlogs.slug, slug)))
    .limit(1);
  const hit = rows[0];
  return Boolean(hit && hit.id !== exceptId);
}

async function resolveSlug(siteId: string, input: LiveBlogInput, exceptId?: string): Promise<string> {
  const base = input.slug || slugify(input.title) || 'direkte';
  if (input.slug) {
    if (await slugExists(siteId, input.slug, exceptId)) {
      throw new ActionError('Slugen er allerede i bruk.', 'validation', {
        slug: ['Slugen er allerede i bruk'],
      });
    }
    return input.slug;
  }
  return uniqueSlug(base, (candidate) => slugExists(siteId, candidate, exceptId));
}

async function assertArticle(siteId: string, articleId: string | null): Promise<void> {
  if (!articleId) return;
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.siteId, siteId), eq(articles.id, articleId), isNull(articles.deletedAt)))
    .limit(1);
  if (!row)
    throw new ActionError('Fant ikke den koblede saken.', 'validation', { articleId: ['Fant ikke saken'] });
}

async function assertAuthor(siteId: string, authorId: string | null): Promise<void> {
  if (!authorId) return;
  const [row] = await db
    .select({ id: authors.id })
    .from(authors)
    .where(and(eq(authors.siteId, siteId), eq(authors.id, authorId)))
    .limit(1);
  if (!row)
    throw new ActionError('Fant ikke skribenten.', 'validation', { authorId: ['Fant ikke skribenten'] });
}

async function touchBlog(id: string, now: Date): Promise<void> {
  await db.update(liveBlogs).set({ updatedAt: now }).where(eq(liveBlogs.id, id));
}

function invalidate(siteId: string, blogId: string): void {
  revalidateLive(blogId);
  revalidatePublic(siteId);
}

/* -------------------------------------------------------------------------- */
/*  Blogs                                                                      */
/* -------------------------------------------------------------------------- */

export async function listLiveBlogs(siteId: string): Promise<LiveBlogListItem[]> {
  const rows = await db
    .select({
      blog: liveBlogs,
      articleTitle: articles.title,
      postCount: sql<number>`(select count(*) from ${livePosts} where ${livePosts.liveBlogId} = ${liveBlogs.id} and ${livePosts.deletedAt} is null)::int`,
      lastPostAt: sql<
        string | null
      >`(select max(${livePosts.publishedAt}) from ${livePosts} where ${livePosts.liveBlogId} = ${liveBlogs.id} and ${livePosts.deletedAt} is null)`,
    })
    .from(liveBlogs)
    .leftJoin(articles, eq(articles.id, liveBlogs.articleId))
    .where(eq(liveBlogs.siteId, siteId))
    .orderBy(
      sql`case ${liveBlogs.status} when 'live' then 0 when 'draft' then 1 else 2 end`,
      desc(liveBlogs.updatedAt),
    );
  return rows.map((r) => ({
    ...r.blog,
    articleTitle: r.articleTitle ?? null,
    postCount: r.postCount,
    lastPostAt: r.lastPostAt ? new Date(r.lastPostAt) : null,
  }));
}

export async function getLiveBlog(siteId: string, id: string): Promise<LiveBlog | null> {
  const [row] = await db
    .select()
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), eq(liveBlogs.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getLiveBlogBySlug(siteId: string, slug: string): Promise<LiveBlog | null> {
  const [row] = await db
    .select()
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), eq(liveBlogs.slug, slug)))
    .limit(1);
  return row ?? null;
}

export async function createLiveBlog(ctx: AdminContext, input: unknown): Promise<LiveBlog> {
  const data = liveBlogInputSchema.parse(input);
  await assertArticle(ctx.site.id, data.articleId);
  const slug = await resolveSlug(ctx.site.id, data);
  const now = new Date();
  const status = data.status;
  const [row] = await db
    .insert(liveBlogs)
    .values({
      siteId: ctx.site.id,
      title: data.title,
      slug,
      description: data.description,
      articleId: data.articleId,
      status,
      startedAt: status === 'live' ? (data.startedAt ?? now) : data.startedAt,
      endedAt: status === 'ended' ? (data.endedAt ?? now) : null,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw new ActionError('Kunne ikke opprette direktesendingen.');
  await auditFromContext(ctx, {
    action: 'live.create',
    entityType: 'live_blog',
    entityId: row.id,
    summary: `Opprettet direktesending «${row.title}»`,
    data: { slug: row.slug, status: row.status },
  });
  if (row.status === 'live') invalidate(ctx.site.id, row.id);
  return row;
}

export async function updateLiveBlog(ctx: AdminContext, id: string, input: unknown): Promise<LiveBlog> {
  const current = await loadBlog(ctx.site.id, id);
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const data = liveBlogInputSchema.parse({ ...raw, status: raw.status ?? current.status });
  await assertArticle(ctx.site.id, data.articleId);
  const slug = await resolveSlug(ctx.site.id, data, id);
  const now = new Date();
  const [row] = await db
    .update(liveBlogs)
    .set({
      title: data.title,
      slug,
      description: data.description,
      articleId: data.articleId,
      updatedAt: now,
    })
    .where(and(eq(liveBlogs.siteId, ctx.site.id), eq(liveBlogs.id, id)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke direktesendingen.');
  await auditFromContext(ctx, {
    action: 'live.update',
    entityType: 'live_blog',
    entityId: row.id,
    summary: `Oppdaterte direktesending «${row.title}»`,
    data: { slug: row.slug, slugChanged: current.slug !== row.slug },
  });
  invalidate(ctx.site.id, row.id);
  return row;
}

/**
 * Status transitions: draft → live (start), live → ended (end), ended → live
 * (reopen), live/ended → draft is not allowed once posts are public.
 */
export async function setLiveBlogStatus(
  ctx: AdminContext,
  id: string,
  status: LiveBlogStatus,
): Promise<LiveBlog> {
  const current = await loadBlog(ctx.site.id, id);
  if (current.status === status) return current;
  if (status === 'draft' && current.status !== 'draft') {
    throw new ActionError('En sending som har vært i gang kan ikke settes tilbake til utkast.', 'validation');
  }
  const now = new Date();
  const patch: Partial<LiveBlog> = { status, updatedAt: now };
  if (status === 'live') {
    patch.startedAt = current.startedAt ?? now;
    patch.endedAt = null;
  }
  if (status === 'ended') patch.endedAt = now;
  const [row] = await db
    .update(liveBlogs)
    .set(patch)
    .where(and(eq(liveBlogs.siteId, ctx.site.id), eq(liveBlogs.id, id)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke direktesendingen.');
  const verbs: Record<LiveBlogStatus, string> = {
    live: 'Startet',
    ended: 'Avsluttet',
    draft: 'Tilbakestilte',
  };
  await auditFromContext(ctx, {
    action: `live.${status === 'live' ? 'start' : status === 'ended' ? 'end' : 'reset'}`,
    entityType: 'live_blog',
    entityId: row.id,
    summary: `${verbs[status]} direktesending «${row.title}»`,
    data: { from: current.status, to: status },
  });
  invalidate(ctx.site.id, row.id);
  return row;
}

export async function deleteLiveBlog(ctx: AdminContext, id: string): Promise<void> {
  const [row] = await db
    .delete(liveBlogs)
    .where(and(eq(liveBlogs.siteId, ctx.site.id), eq(liveBlogs.id, id)))
    .returning({ id: liveBlogs.id, title: liveBlogs.title });
  if (!row) throw new NotFoundError('Fant ikke direktesendingen.');
  await auditFromContext(ctx, {
    action: 'live.delete',
    entityType: 'live_blog',
    entityId: row.id,
    summary: `Slettet direktesending «${row.title}»`,
  });
  invalidate(ctx.site.id, row.id);
}

/* -------------------------------------------------------------------------- */
/*  Posts                                                                      */
/* -------------------------------------------------------------------------- */

const postColumns = {
  post: livePosts,
  authorName: authors.name,
  authorSlug: authors.slug,
};

function toView(r: { post: LivePost; authorName: string | null; authorSlug: string | null }): LivePostView {
  return { ...r.post, authorName: r.authorName, authorSlug: r.authorSlug };
}

/** Visible posts of a blog, pinned first then newest first. */
export async function listPosts(liveBlogId: string, opts: { limit?: number } = {}): Promise<LivePostView[]> {
  const rows = await db
    .select(postColumns)
    .from(livePosts)
    .leftJoin(authors, eq(authors.id, livePosts.authorId))
    .where(and(eq(livePosts.liveBlogId, liveBlogId), isNull(livePosts.deletedAt)))
    .orderBy(desc(livePosts.isPinned), desc(livePosts.publishedAt), desc(livePosts.id))
    .limit(Math.min(500, Math.max(1, opts.limit ?? 200)));
  return rows.map(toView);
}

export async function getPost(
  siteId: string,
  postId: string,
): Promise<{ post: LivePostView; blog: LiveBlog } | null> {
  const [row] = await db
    .select({ ...postColumns, blog: liveBlogs })
    .from(livePosts)
    .innerJoin(liveBlogs, eq(liveBlogs.id, livePosts.liveBlogId))
    .leftJoin(authors, eq(authors.id, livePosts.authorId))
    .where(and(eq(livePosts.id, postId), eq(liveBlogs.siteId, siteId)))
    .limit(1);
  return row ? { post: toView(row), blog: row.blog } : null;
}

export async function addPost(ctx: AdminContext, input: unknown): Promise<LivePostView> {
  const data = livePostInputSchema.parse(input);
  const blog = await loadBlog(ctx.site.id, data.liveBlogId);
  await assertAuthor(ctx.site.id, data.authorId);
  const now = new Date();
  const body = sanitizeDoc(data.body);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(livePosts)
      .values({
        liveBlogId: blog.id,
        title: data.title,
        body,
        authorId: data.authorId,
        isPinned: data.isPinned,
        isKeyEvent: data.isKeyEvent,
        publishedAt: data.publishedAt ?? now,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!row) throw new ActionError('Kunne ikke lagre innlegget.');
    await touchBlog(blog.id, now);
    return row;
  });
  const view = (await getPost(ctx.site.id, created.id))?.post;
  if (!view) throw new ActionError('Kunne ikke lese innlegget etter lagring.');
  await auditFromContext(ctx, {
    action: 'live.post_create',
    entityType: 'live_post',
    entityId: created.id,
    summary: `Nytt innlegg i «${blog.title}»${data.title ? `: «${data.title}»` : ''}`,
    data: { liveBlogId: blog.id, isKeyEvent: data.isKeyEvent, isPinned: data.isPinned },
  });
  invalidate(ctx.site.id, blog.id);
  await enqueueWebhookEvent(ctx.site.id, 'live.post_created', {
    id: created.id,
    liveBlogId: blog.id,
    liveBlogTitle: blog.title,
    liveBlogSlug: blog.slug,
    path: publicPaths.live(blog.slug),
    adminPath: adminPaths.liveBlog(blog.id),
    title: created.title,
    excerpt: docExcerpt(body, 200),
    authorName: view.authorName,
    isKeyEvent: created.isKeyEvent,
    isPinned: created.isPinned,
    publishedAt: created.publishedAt.toISOString(),
  });
  return view;
}

export async function updatePost(ctx: AdminContext, input: unknown): Promise<LivePostView> {
  const data = livePostUpdateSchema.parse(input);
  const existing = await getPost(ctx.site.id, data.id);
  if (!existing || existing.post.deletedAt) throw new NotFoundError('Fant ikke innlegget.');
  if (data.authorId !== undefined) await assertAuthor(ctx.site.id, data.authorId);
  const body = data.body !== undefined ? sanitizeDoc(data.body) : undefined;
  const title = data.title !== undefined ? data.title : existing.post.title;
  if (body !== undefined && isEmptyDoc(body) && !title) {
    throw new ActionError('Innlegget kan ikke være tomt.', 'validation', {
      body: ['Innlegget kan ikke være tomt'],
    });
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(livePosts)
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(body !== undefined ? { body } : {}),
        ...(data.authorId !== undefined ? { authorId: data.authorId } : {}),
        ...(data.isPinned !== undefined ? { isPinned: data.isPinned } : {}),
        ...(data.isKeyEvent !== undefined ? { isKeyEvent: data.isKeyEvent } : {}),
        updatedAt: now,
      })
      .where(eq(livePosts.id, data.id));
    await touchBlog(existing.blog.id, now);
  });
  const updated = await getPost(ctx.site.id, data.id);
  if (!updated) throw new NotFoundError('Fant ikke innlegget.');
  await auditFromContext(ctx, {
    action: 'live.post_update',
    entityType: 'live_post',
    entityId: data.id,
    summary: `Redigerte innlegg i «${existing.blog.title}»`,
    data: { liveBlogId: existing.blog.id, fields: Object.keys(data).filter((k) => k !== 'id') },
  });
  invalidate(ctx.site.id, existing.blog.id);
  return updated.post;
}

/** Soft delete: the row stays so the polling endpoint can tell readers to drop it. */
export async function deletePost(ctx: AdminContext, postId: string): Promise<void> {
  const existing = await getPost(ctx.site.id, postId);
  if (!existing || existing.post.deletedAt) throw new NotFoundError('Fant ikke innlegget.');
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(livePosts).set({ deletedAt: now, updatedAt: now }).where(eq(livePosts.id, postId));
    await touchBlog(existing.blog.id, now);
  });
  await auditFromContext(ctx, {
    action: 'live.post_delete',
    entityType: 'live_post',
    entityId: postId,
    summary: `Slettet innlegg i «${existing.blog.title}»`,
    data: { liveBlogId: existing.blog.id },
  });
  invalidate(ctx.site.id, existing.blog.id);
}

/* -------------------------------------------------------------------------- */
/*  Public reads                                                               */
/* -------------------------------------------------------------------------- */

async function postMedia(siteId: string, posts: Pick<LivePost, 'body'>[]): Promise<Map<string, Media>> {
  const ids = new Set<string>();
  for (const p of posts) for (const id of docMediaIds(p.body)) ids.add(id);
  if (!ids.size) return new Map();
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.id, [...ids]), isNull(media.deletedAt)));
  return new Map(rows.map((m) => [m.id, m]));
}

/** Everything the public live page needs; null for unknown slugs and drafts. */
export async function getPublicLiveBlog(siteId: string, slug: string): Promise<PublicLiveBlog | null> {
  const blog = await getLiveBlogBySlug(siteId, slug);
  if (!blog || blog.status === 'draft') return null;
  const posts = await listPosts(blog.id, { limit: 300 });
  const keyEvents = posts
    .filter((p) => p.isKeyEvent)
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const mediaMap = await postMedia(siteId, posts);
  let article: PublicLiveBlog['article'] = null;
  if (blog.articleId) {
    const [a] = await db
      .select({ id: articles.id, title: articles.title, slug: articles.slug, sectionSlug: sections.slug })
      .from(articles)
      .leftJoin(sections, eq(sections.id, articles.sectionId))
      .where(
        and(eq(articles.id, blog.articleId), eq(articles.status, 'published'), isNull(articles.deletedAt)),
      )
      .limit(1);
    if (a)
      article = {
        id: a.id,
        title: a.title,
        path: publicPaths.article(a.sectionSlug, a.sectionSlug ? a.slug : a.id),
      };
  }
  return { blog, posts, keyEvents, media: mediaMap, article };
}

/**
 * Posts created, edited or deleted after `after` (all posts when null),
 * for the polling endpoint. Deleted ids are reported separately so the
 * client can remove them.
 */
export async function listPostsAfter(
  liveBlogId: string,
  after: Date | null,
  limit = 50,
): Promise<PostsDelta> {
  const [blog] = await db.select().from(liveBlogs).where(eq(liveBlogs.id, liveBlogId)).limit(1);
  if (!blog) throw new NotFoundError('Fant ikke direktesendingen.');
  const max = Math.min(100, Math.max(1, limit));
  const changed = after ? or(gt(livePosts.publishedAt, after), gt(livePosts.updatedAt, after)) : undefined;
  const rows = await db
    .select(postColumns)
    .from(livePosts)
    .leftJoin(authors, eq(authors.id, livePosts.authorId))
    .where(and(eq(livePosts.liveBlogId, liveBlogId), changed))
    .orderBy(desc(livePosts.updatedAt), desc(livePosts.id))
    .limit(max);
  const live = rows.filter((r) => !r.post.deletedAt).map(toView);
  const deleted = rows.filter((r) => Boolean(r.post.deletedAt)).map((r) => r.post.id);
  const mediaMap = await postMedia(blog.siteId, live);
  return {
    posts: sortPosts(live).map(toPostDto),
    deleted,
    media: Object.fromEntries(mediaMap),
    status: blog.status,
    serverTime: new Date().toISOString(),
  };
}

/** Author options for the composer (active authors of the site). */
export async function listAuthorOptions(
  siteId: string,
): Promise<{ id: string; name: string; userId: string | null }[]> {
  return db
    .select({ id: authors.id, name: authors.name, userId: authors.userId })
    .from(authors)
    .where(and(eq(authors.siteId, siteId), eq(authors.isActive, true)))
    .orderBy(asc(authors.sortOrder), asc(authors.name));
}
