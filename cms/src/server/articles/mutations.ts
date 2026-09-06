/**
 * Low-level article writes shared by the service: slug resolution, the
 * tag/byline/related junction tables, text projections, canonical paths and
 * redirects. No permission checks here — service.ts owns those. Every
 * helper accepts a transaction (or the db) so callers can group writes.
 */
import 'server-only';

import { randomBytes } from 'node:crypto';

import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import { db, type Db, type Tx } from '@/db';
import {
  articleBylines,
  articleRelated,
  articleTags,
  articles,
  authors,
  contentTypes,
  memberships,
  redirects,
  sections,
  tags,
  type Article,
  type BylineRole,
  type ContentType,
} from '@/db/schema';
import { publicPaths } from '@/config/routes';
import { docToPlainText, docWordCount, readingTimeMinutes } from '@/lib/content/text';
import type { ContentDoc } from '@/lib/content/types';
import { slugify, uniqueSlug } from '@/lib/text/slug';
import type { FieldDef } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';

type Writer = Db | Tx;

/** Flag stored in `articles.flags` when the slug was set by hand (auto-generation stops). */
export const SLUG_LOCKED_FLAG = 'slugLocked';

/* -------------------------------------------------------------------------- */
/*  Loading and permissions                                                    */
/* -------------------------------------------------------------------------- */

export async function loadArticle(
  siteId: string,
  id: string,
  opts: { includeTrashed?: boolean; tx?: Writer } = {},
): Promise<Article | null> {
  const writer = opts.tx ?? db;
  const [row] = await writer
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.id, id),
        eq(articles.siteId, siteId),
        opts.includeTrashed ? undefined : isNull(articles.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Contributors edit only their own articles; journalists and up edit everything (SPEC 5.1). */
export function canEditArticle(
  ctx: Pick<AdminContext, 'user' | 'can'>,
  article: Pick<Article, 'createdBy'>,
): boolean {
  if (ctx.can('article:edit_any')) return true;
  return ctx.can('article:edit_own') && article.createdBy === ctx.user.id;
}

/* -------------------------------------------------------------------------- */
/*  Text projections                                                           */
/* -------------------------------------------------------------------------- */

export function textFields(body: ContentDoc): { bodyText: string; wordCount: number; readingTimeMin: number } {
  const bodyText = docToPlainText(body);
  const wordCount = docWordCount(body);
  return { bodyText, wordCount, readingTimeMin: readingTimeMinutes(wordCount) };
}

/* -------------------------------------------------------------------------- */
/*  Slugs                                                                      */
/* -------------------------------------------------------------------------- */

export async function slugExists(tx: Writer, siteId: string, slug: string, excludeId?: string): Promise<boolean> {
  const rows = await tx
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(eq(articles.siteId, siteId), eq(articles.slug, slug), excludeId ? ne(articles.id, excludeId) : undefined),
    )
    .limit(1);
  return rows.length > 0;
}

/** A unique placeholder slug for drafts without a title ("utkast-k3j9x2ab"). */
export async function placeholderSlug(tx: Writer, siteId: string): Promise<string> {
  const suffix = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  return uniqueSlug(`utkast-${suffix || 'ny'}`, (candidate) => slugExists(tx, siteId, candidate));
}

export function isPlaceholderSlug(slug: string): boolean {
  return /^utkast-[a-z0-9]+(?:-\d+)?$/.test(slug);
}

/**
 * Decide the slug for a save.
 *  - an explicit `requested` slug wins (made unique with -2, -3 …)
 *  - otherwise, when the slug is not locked (never edited by hand, never
 *    published) and the title is non-empty, derive it from the title
 *  - else keep the current slug
 */
export async function resolveSlug(
  tx: Writer,
  input: {
    siteId: string;
    articleId: string;
    current: string;
    requested: string;
    title: string;
    locked: boolean;
  },
): Promise<string> {
  const exists = (candidate: string) => slugExists(tx, input.siteId, candidate, input.articleId);
  if (input.requested) {
    if (input.requested === input.current) return input.current;
    return uniqueSlug(input.requested, exists);
  }
  if (input.locked) return input.current;
  const base = slugify(input.title);
  if (!base) return input.current;
  // Keep a slug that already matches the title (possibly with a -n suffix) to avoid churn.
  if (input.current === base || /^(.+)-\d+$/.exec(input.current)?.[1] === base) return input.current;
  return uniqueSlug(base, exists);
}

/* -------------------------------------------------------------------------- */
/*  Site-scoped id filtering                                                   */
/* -------------------------------------------------------------------------- */

export async function existingTagIds(tx: Writer, siteId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.siteId, siteId), inArray(tags.id, unique)));
  const found = new Set(rows.map((r) => r.id));
  return unique.filter((id) => found.has(id));
}

export async function existingAuthorIds(tx: Writer, siteId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await tx
    .select({ id: authors.id })
    .from(authors)
    .where(and(eq(authors.siteId, siteId), inArray(authors.id, unique)));
  const found = new Set(rows.map((r) => r.id));
  return unique.filter((id) => found.has(id));
}

export async function existingArticleIds(
  tx: Writer,
  siteId: string,
  ids: string[],
  excludeId?: string,
): Promise<string[]> {
  const unique = [...new Set(ids)].filter((id) => id !== excludeId);
  if (unique.length === 0) return [];
  const rows = await tx
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.siteId, siteId), inArray(articles.id, unique), isNull(articles.deletedAt)));
  const found = new Set(rows.map((r) => r.id));
  return unique.filter((id) => found.has(id));
}

export async function sectionBelongsToSite(tx: Writer, siteId: string, sectionId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: sections.id })
    .from(sections)
    .where(and(eq(sections.id, sectionId), eq(sections.siteId, siteId)))
    .limit(1);
  return rows.length > 0;
}

export async function loadContentType(
  tx: Writer,
  siteId: string,
  contentTypeId: string,
): Promise<ContentType | null> {
  const [row] = await tx
    .select()
    .from(contentTypes)
    .where(and(eq(contentTypes.id, contentTypeId), eq(contentTypes.siteId, siteId)))
    .limit(1);
  return row ?? null;
}

/** The site's default content type (falls back to the first active one). */
export async function defaultContentType(tx: Writer, siteId: string): Promise<ContentType | null> {
  const rows = await tx
    .select()
    .from(contentTypes)
    .where(and(eq(contentTypes.siteId, siteId), eq(contentTypes.isActive, true)))
    .orderBy(contentTypes.sortOrder, contentTypes.createdAt);
  return rows.find((c) => c.isDefault) ?? rows[0] ?? null;
}

/** Keep only values whose key exists among the field definitions (unknown keys are dropped). */
export function pickKnownCustomFields(
  fields: FieldDef[],
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const known = new Set(fields.map((f) => f.key));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (known.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Junction tables                                                            */
/* -------------------------------------------------------------------------- */

export type BylineRow = { authorId: string; role: BylineRole };

export async function syncTags(tx: Writer, articleId: string, tagIds: string[]): Promise<void> {
  await tx.delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (tagIds.length) await tx.insert(articleTags).values(tagIds.map((tagId) => ({ articleId, tagId })));
}

export async function syncBylines(tx: Writer, articleId: string, bylines: BylineRow[]): Promise<void> {
  await tx.delete(articleBylines).where(eq(articleBylines.articleId, articleId));
  // One row per author (primary key); the first occurrence wins.
  const seen = new Set<string>();
  const rows = bylines
    .filter((b) => (seen.has(b.authorId) ? false : (seen.add(b.authorId), true)))
    .map((b, i) => ({ articleId, authorId: b.authorId, role: b.role, sortOrder: i }));
  if (rows.length) await tx.insert(articleBylines).values(rows);
}

export async function syncRelated(tx: Writer, articleId: string, relatedIds: string[]): Promise<void> {
  await tx.delete(articleRelated).where(eq(articleRelated.articleId, articleId));
  if (relatedIds.length) {
    await tx
      .insert(articleRelated)
      .values(relatedIds.map((relatedId, i) => ({ articleId, relatedId, sortOrder: i })));
  }
}

export type ArticleRelations = { tagIds: string[]; bylines: BylineRow[]; relatedIds: string[] };

export async function loadRelations(tx: Writer, articleId: string): Promise<ArticleRelations> {
  const [tagRows, bylineRows, relatedRows] = await Promise.all([
    tx.select({ tagId: articleTags.tagId }).from(articleTags).where(eq(articleTags.articleId, articleId)),
    tx
      .select({ authorId: articleBylines.authorId, role: articleBylines.role, sortOrder: articleBylines.sortOrder })
      .from(articleBylines)
      .where(eq(articleBylines.articleId, articleId))
      .orderBy(articleBylines.sortOrder),
    tx
      .select({ relatedId: articleRelated.relatedId, sortOrder: articleRelated.sortOrder })
      .from(articleRelated)
      .where(eq(articleRelated.articleId, articleId))
      .orderBy(articleRelated.sortOrder),
  ]);
  return {
    tagIds: tagRows.map((r) => r.tagId),
    bylines: bylineRows.map((r) => ({ authorId: r.authorId, role: r.role })),
    relatedIds: relatedRows.map((r) => r.relatedId),
  };
}

/* -------------------------------------------------------------------------- */
/*  Canonical paths and redirects (SPEC 5.3)                                   */
/* -------------------------------------------------------------------------- */

/** `/{section}/{slug}` or `/a/{id}` when the article has no (active) section. */
export async function canonicalPath(
  tx: Writer,
  article: Pick<Article, 'id' | 'slug' | 'sectionId'>,
): Promise<string> {
  if (!article.sectionId) return publicPaths.shortLink(article.id);
  const [section] = await tx
    .select({ slug: sections.slug })
    .from(sections)
    .where(eq(sections.id, article.sectionId))
    .limit(1);
  return section ? publicPaths.article(section.slug, article.slug) : publicPaths.shortLink(article.id);
}

/**
 * Record a redirect from an old public path to the new one. Existing
 * redirects pointing at the old path are re-targeted so chains never form,
 * and a redirect from the new path (if any) is removed to avoid loops.
 */
export async function recordRedirect(tx: Writer, siteId: string, fromPath: string, toPath: string): Promise<void> {
  if (!fromPath || !toPath || fromPath === toPath) return;
  await tx.delete(redirects).where(and(eq(redirects.siteId, siteId), eq(redirects.fromPath, toPath)));
  await tx
    .update(redirects)
    .set({ toPath })
    .where(and(eq(redirects.siteId, siteId), eq(redirects.toPath, fromPath)));
  await tx
    .insert(redirects)
    .values({ siteId, fromPath, toPath, statusCode: 301 })
    .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath } });
}

/* -------------------------------------------------------------------------- */
/*  People to notify                                                           */
/* -------------------------------------------------------------------------- */

/** Users on the desk (editors and admins) for "Send til desk" notifications. */
export async function deskUserIds(siteId: string, exceptUserId?: string): Promise<string[]> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.siteId, siteId), inArray(memberships.role, ['editor', 'admin'])));
  return rows.map((r) => r.userId).filter((id) => id !== exceptUserId);
}
