/**
 * Public read queries (SPEC 4.8). Everything here is site-scoped and only
 * returns articles with `status = 'published'`, `publishedAt <= now()` and
 * `deletedAt IS NULL` — the one exception is `getArticleForPreview()`, which
 * the admin preview page uses for unpublished articles and never caches.
 *
 * Exported `get*`/`list*`/`search*` functions read through `cachedRead()`
 * (unstable_cache + site tags); the raw `load*` functions do the actual SQL
 * and are what `layoutSource()` hands to the layout engine so the front
 * page is cached once as a whole.
 *
 *   const article = await getArticleByPath(site.id, 'nyheter', 'budsjettet-vedtatt');
 *   const front = await getFrontLayout(site.id);
 *   const { items, total } = await searchArticles(site.id, 'kommunestyret', { limit: 20, offset: 0 });
 */
import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  articleBylines,
  articleRelated,
  articleTags,
  articleViews,
  articles,
  authors,
  contentTypes,
  layouts,
  liveBlogs,
  livePosts,
  media,
  menus,
  sections,
  tags,
  type ArticleAccess,
  type ArticleStatus,
  type Author,
  type BylineRole,
  type Media,
  type Section,
  type Tag,
} from '@/db/schema';
import { sanitizeDoc } from '@/lib/content/schema';
import type { ContentDoc } from '@/lib/content/types';
import { docArticleIds, docLiveBlogIds, docMediaIds } from '@/lib/content/text';
import {
  defaultFrontLayout,
  parseLayoutDoc,
  resolveLayout,
  type ArticleTeaser,
  type LayoutQuery,
  type LayoutSource,
  type LiveBlogSummary,
  type ResolvedLayout,
} from '@/lib/layout/engine';
import type { LayoutDoc } from '@/lib/layout/types';
import { menuItemSchema, type MenuItem } from '@/lib/validation/site';
import { cacheTags } from '@/server/cache';
import { getMediaMany } from '@/server/media/queries';

import { cachedRead } from './cached';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type PublicByline = {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  role: BylineRole;
  image: Media | null;
};

export type PublicTag = Pick<Tag, 'id' | 'name' | 'slug'>;

/** Everything the article page needs, loaded in one go. */
export type PublicArticle = {
  id: string;
  siteId: string;
  status: ArticleStatus;
  title: string;
  kicker: string | null;
  lead: string | null;
  slug: string;
  body: ContentDoc;
  bodyText: string;
  access: ArticleAccess;
  section: Section | null;
  contentType: { id: string; key: string; name: string; template: string };
  featuredMedia: Media | null;
  featuredCaption: string | null;
  featuredCredit: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  noIndex: boolean;
  isBreaking: boolean;
  isSponsored: boolean;
  customFields: Record<string, unknown>;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  updatedAt: Date;
  wordCount: number;
  readingTimeMin: number;
  /** Author user id (preview access checks for contributors). */
  createdBy: string | null;
  tags: PublicTag[];
  bylines: PublicByline[];
  /** Editorially linked articles (article_related), published only. */
  related: ArticleTeaser[];
  /** Media referenced by the body (image/gallery nodes), keyed by id. */
  bodyMedia: Record<string, Media>;
  /** Teasers referenced by relatedArticles nodes, keyed by id. */
  bodyArticles: Record<string, ArticleTeaser>;
  /** Live blogs referenced by liveBlog nodes, keyed by id. */
  bodyLiveBlogs: Record<string, LiveBlogSummary>;
};

export type TeaserQuery = {
  sectionId?: string;
  /** Explicit list of section ids (overrides sectionId; no descendant expansion). */
  sectionIds?: string[];
  tagId?: string;
  authorId?: string;
  contentTypeKey?: string;
  access?: ArticleAccess;
  limit: number;
  offset?: number;
  exclude?: string[];
  order?: 'published' | 'most-read';
  /** Window for most-read ordering, in days. */
  days?: number;
};

export type HeadlineSegment = { text: string; highlight: boolean };
export type SearchHit = ArticleTeaser & { headline: HeadlineSegment[]; rank: number };
export type SearchResult = { items: SearchHit[]; total: number };

export type PublicAuthor = Author & { image: Media | null };

export type SitemapArticle = {
  id: string;
  slug: string;
  sectionSlug: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  noIndex: boolean;
};

export type FeedArticle = ArticleTeaser & {
  body: ContentDoc;
  seoDescription: string | null;
  tags: string[];
  bodyMedia: Record<string, Media>;
  bodyArticles: Record<string, ArticleTeaser>;
};

export const MAX_TEASER_LIMIT = 100;
export const SEARCH_MAX_LIMIT = 50;

/* Headline markers: control characters cannot occur in editorial text. */
const HL_START = '\u0002';
const HL_STOP = '\u0003';
const HEADLINE_OPTIONS = `MaxFragments=2, MaxWords=24, MinWords=12, FragmentDelimiter= … , StartSel=${HL_START}, StopSel=${HL_STOP}`;

/* -------------------------------------------------------------------------- */
/*  Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/** The "readers may see it" predicate (SPEC 4.8). */
export function publishedWhere(siteId: string): SQL {
  return and(
    eq(articles.siteId, siteId),
    eq(articles.status, 'published'),
    lte(articles.publishedAt, sql`now()`),
    isNull(articles.deletedAt),
  ) as SQL;
}

const teaserColumns = {
  id: articles.id,
  title: articles.title,
  kicker: articles.kicker,
  lead: articles.lead,
  slug: articles.slug,
  access: articles.access,
  publishedAt: articles.publishedAt,
  updatedAt: articles.updatedAt,
  isBreaking: articles.isBreaking,
  isSponsored: articles.isSponsored,
  readingTimeMin: articles.readingTimeMin,
  sectionSlug: sections.slug,
  sectionName: sections.name,
  contentTypeKey: contentTypes.key,
  featuredMedia: media,
};

type TeaserRow = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  slug: string;
  access: ArticleAccess;
  publishedAt: Date | null;
  updatedAt: Date;
  isBreaking: boolean;
  isSponsored: boolean;
  readingTimeMin: number;
  sectionSlug: string | null;
  sectionName: string | null;
  contentTypeKey: string | null;
  featuredMedia: Media | null;
};

/** Teaser byline: the engine contract (name + slug) plus what opinion blocks need. */
export type TeaserByline = { name: string; slug: string; title: string | null; image: Media | null };
type BylineName = TeaserByline;

function liveMedia(m: Media | null | undefined): Media | null {
  return m && !m.deletedAt ? m : null;
}

function toTeaser(row: TeaserRow, bylines: BylineName[]): ArticleTeaser {
  return {
    id: row.id,
    title: row.title,
    kicker: row.kicker,
    lead: row.lead,
    slug: row.slug,
    sectionSlug: row.sectionSlug,
    sectionName: row.sectionName,
    access: row.access,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    isBreaking: row.isBreaking,
    isSponsored: row.isSponsored,
    contentTypeKey: row.contentTypeKey ?? 'article',
    featuredMedia: liveMedia(row.featuredMedia),
    bylines,
    readingTimeMin: Math.max(1, row.readingTimeMin || 1),
  };
}

/** Author names per article, in byline order. */
async function bylineNames(articleIds: string[]): Promise<Map<string, BylineName[]>> {
  const out = new Map<string, BylineName[]>();
  if (!articleIds.length) return out;
  const rows = await db
    .select({
      articleId: articleBylines.articleId,
      name: authors.name,
      slug: authors.slug,
      title: authors.title,
      image: media,
      sortOrder: articleBylines.sortOrder,
    })
    .from(articleBylines)
    .innerJoin(authors, eq(authors.id, articleBylines.authorId))
    .leftJoin(media, eq(media.id, authors.imageMediaId))
    .where(inArray(articleBylines.articleId, articleIds))
    .orderBy(asc(articleBylines.sortOrder), asc(authors.name));
  for (const r of rows) {
    const list = out.get(r.articleId) ?? [];
    list.push({ name: r.name, slug: r.slug, title: r.title, image: liveMedia(r.image) });
    out.set(r.articleId, list);
  }
  return out;
}

async function withBylines(rows: TeaserRow[]): Promise<ArticleTeaser[]> {
  const names = await bylineNames(rows.map((r) => r.id));
  return rows.map((r) => toTeaser(r, names.get(r.id) ?? []));
}

function teaserSelect() {
  return db
    .select(teaserColumns)
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(media, eq(media.id, articles.featuredMediaId));
}

/** WHERE clauses for a teaser query, on top of the published predicate. */
function teaserFilters(siteId: string, q: TeaserQuery): SQL {
  const clauses: (SQL | undefined)[] = [publishedWhere(siteId)];
  if (q.sectionIds && q.sectionIds.length) {
    clauses.push(inArray(articles.sectionId, q.sectionIds));
  } else if (q.sectionId) {
    // A section feed includes its child sections (Meninger → Debatt).
    clauses.push(
      or(
        eq(articles.sectionId, q.sectionId),
        inArray(
          articles.sectionId,
          db.select({ id: sections.id }).from(sections).where(eq(sections.parentId, q.sectionId)),
        ),
      ),
    );
  }
  if (q.tagId) {
    clauses.push(
      inArray(
        articles.id,
        db.select({ id: articleTags.articleId }).from(articleTags).where(eq(articleTags.tagId, q.tagId)),
      ),
    );
  }
  if (q.authorId) {
    clauses.push(
      inArray(
        articles.id,
        db
          .select({ id: articleBylines.articleId })
          .from(articleBylines)
          .where(eq(articleBylines.authorId, q.authorId)),
      ),
    );
  }
  if (q.contentTypeKey) clauses.push(eq(contentTypes.key, q.contentTypeKey));
  if (q.access) clauses.push(eq(articles.access, q.access));
  if (q.exclude && q.exclude.length) clauses.push(notInArray(articles.id, q.exclude));
  return and(...clauses) as SQL;
}

function clampLimit(limit: number, max = MAX_TEASER_LIMIT): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(max, Math.floor(limit));
}

/** "YYYY-MM-DD" `days` days ago (UTC date is precise enough for a window). */
function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - Math.max(1, days) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/*  Raw loaders (uncached)                                                     */
/* -------------------------------------------------------------------------- */

export async function loadTeasers(siteId: string, q: TeaserQuery): Promise<ArticleTeaser[]> {
  const limit = clampLimit(q.limit);
  if (limit === 0) return [];
  const where = teaserFilters(siteId, q);
  const offset = Math.max(0, Math.floor(q.offset ?? 0));

  let rows: TeaserRow[];
  if (q.order === 'most-read') {
    const since = daysAgoIso(q.days ?? 7);
    const views = db
      .select({
        articleId: articleViews.articleId,
        total: sql<number>`sum(${articleViews.views})`.as('total'),
      })
      .from(articleViews)
      .where(gte(articleViews.day, since))
      .groupBy(articleViews.articleId)
      .as('v');
    rows = await teaserSelect()
      .leftJoin(views, eq(views.articleId, articles.id))
      .where(where)
      .orderBy(desc(sql`coalesce(${views.total}, 0)`), desc(articles.publishedAt), desc(articles.id))
      .limit(limit)
      .offset(offset);
  } else {
    rows = await teaserSelect()
      .where(where)
      .orderBy(desc(articles.publishedAt), desc(articles.id))
      .limit(limit)
      .offset(offset);
  }
  return withBylines(rows);
}

export async function loadTeaserCount(
  siteId: string,
  q: Omit<TeaserQuery, 'limit' | 'offset'>,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(articles)
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .where(teaserFilters(siteId, { ...q, limit: 1 }));
  return row?.total ?? 0;
}

/** Published teasers for a set of ids, in the order requested (missing ids skipped). */
export async function loadTeasersByIds(siteId: string, ids: string[]): Promise<ArticleTeaser[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const rows = await teaserSelect().where(and(publishedWhere(siteId), inArray(articles.id, unique)));
  const teasers = await withBylines(rows);
  const byId = new Map(teasers.map((t) => [t.id, t]));
  return unique.map((id) => byId.get(id)).filter((t): t is ArticleTeaser => Boolean(t));
}

/** Live blogs currently live, newest first, with visible post counts. */
export async function loadLiveBlogs(siteId: string): Promise<LiveBlogSummary[]> {
  const rows = await db
    .select({
      id: liveBlogs.id,
      title: liveBlogs.title,
      slug: liveBlogs.slug,
      description: liveBlogs.description,
      status: liveBlogs.status,
      startedAt: liveBlogs.startedAt,
      updatedAt: liveBlogs.updatedAt,
      postCount: sql<number>`(select count(*) from ${livePosts} where ${livePosts.liveBlogId} = ${liveBlogs.id} and ${livePosts.deletedAt} is null)`,
    })
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), eq(liveBlogs.status, 'live')))
    .orderBy(desc(liveBlogs.startedAt), desc(liveBlogs.updatedAt));
  return rows.map((r) => ({ ...r, postCount: Number(r.postCount) }));
}

async function loadLiveBlogsByIds(siteId: string, ids: string[]): Promise<Record<string, LiveBlogSummary>> {
  const out: Record<string, LiveBlogSummary> = {};
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return out;
  const rows = await db
    .select({
      id: liveBlogs.id,
      title: liveBlogs.title,
      slug: liveBlogs.slug,
      description: liveBlogs.description,
      status: liveBlogs.status,
      startedAt: liveBlogs.startedAt,
      updatedAt: liveBlogs.updatedAt,
    })
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), inArray(liveBlogs.id, unique)));
  for (const r of rows) out[r.id] = r;
  return out;
}

type ArticleRow = {
  article: typeof articles.$inferSelect;
  section: Section | null;
  contentType: { id: string; key: string; name: string; template: string } | null;
  featuredMedia: Media | null;
};

function articleSelect() {
  return db
    .select({
      article: articles,
      section: sections,
      contentType: {
        id: contentTypes.id,
        key: contentTypes.key,
        name: contentTypes.name,
        template: contentTypes.template,
      },
      featuredMedia: media,
    })
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(media, eq(media.id, articles.featuredMediaId));
}

async function loadBylines(articleId: string): Promise<PublicByline[]> {
  const rows = await db
    .select({ author: authors, role: articleBylines.role, image: media })
    .from(articleBylines)
    .innerJoin(authors, eq(authors.id, articleBylines.authorId))
    .leftJoin(media, eq(media.id, authors.imageMediaId))
    .where(eq(articleBylines.articleId, articleId))
    .orderBy(asc(articleBylines.sortOrder), asc(authors.name));
  return rows.map((r) => ({
    id: r.author.id,
    name: r.author.name,
    slug: r.author.slug,
    title: r.author.title,
    role: r.role,
    image: liveMedia(r.image),
  }));
}

async function loadTags(articleId: string): Promise<PublicTag[]> {
  const rows = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(eq(articleTags.articleId, articleId))
    .orderBy(asc(tags.name));
  return rows;
}

async function loadRelatedIds(articleId: string): Promise<string[]> {
  const rows = await db
    .select({ id: articleRelated.relatedId })
    .from(articleRelated)
    .where(eq(articleRelated.articleId, articleId))
    .orderBy(asc(articleRelated.sortOrder));
  return rows.map((r) => r.id);
}

async function buildPublicArticle(siteId: string, row: ArticleRow): Promise<PublicArticle> {
  const a = row.article;
  const body = sanitizeDoc(a.body);
  const [bylines, tagList, relatedIds, bodyMediaMap, bodyArticles, bodyLiveBlogs] = await Promise.all([
    loadBylines(a.id),
    loadTags(a.id),
    loadRelatedIds(a.id),
    getMediaMany(siteId, docMediaIds(body)),
    loadTeasersByIds(siteId, docArticleIds(body)),
    loadLiveBlogsByIds(siteId, docLiveBlogIds(body)),
  ]);
  const related = await loadTeasersByIds(
    siteId,
    relatedIds.filter((id) => id !== a.id),
  );
  return {
    id: a.id,
    siteId: a.siteId,
    status: a.status,
    title: a.title,
    kicker: a.kicker,
    lead: a.lead,
    slug: a.slug,
    body,
    bodyText: a.bodyText,
    access: a.access,
    section: row.section,
    contentType: row.contentType ?? {
      id: a.contentTypeId,
      key: 'article',
      name: 'Artikkel',
      template: 'article',
    },
    featuredMedia: liveMedia(row.featuredMedia),
    featuredCaption: a.featuredCaption,
    featuredCredit: a.featuredCredit,
    seoTitle: a.seoTitle,
    seoDescription: a.seoDescription,
    canonicalUrl: a.canonicalUrl,
    noIndex: a.noIndex,
    isBreaking: a.isBreaking,
    isSponsored: a.isSponsored,
    customFields: a.customFields ?? {},
    publishedAt: a.publishedAt,
    firstPublishedAt: a.firstPublishedAt,
    updatedAt: a.updatedAt,
    wordCount: a.wordCount,
    readingTimeMin: Math.max(1, a.readingTimeMin || 1),
    createdBy: a.createdBy,
    tags: tagList,
    bylines,
    related,
    bodyMedia: Object.fromEntries(bodyMediaMap),
    bodyArticles: Object.fromEntries(bodyArticles.map((t) => [t.id, t])),
    bodyLiveBlogs,
  };
}

export async function loadArticleByPath(
  siteId: string,
  sectionSlug: string,
  slug: string,
): Promise<PublicArticle | null> {
  const [row] = await articleSelect()
    .where(and(publishedWhere(siteId), eq(articles.slug, slug), eq(sections.slug, sectionSlug)))
    .limit(1);
  return row ? buildPublicArticle(siteId, row) : null;
}

export async function loadArticleById(siteId: string, id: string): Promise<PublicArticle | null> {
  const [row] = await articleSelect()
    .where(and(publishedWhere(siteId), eq(articles.id, id)))
    .limit(1);
  return row ? buildPublicArticle(siteId, row) : null;
}

/** Published article by slug regardless of section (for canonical redirects after a section move). */
export async function loadArticleBySlug(siteId: string, slug: string): Promise<PublicArticle | null> {
  const [row] = await articleSelect()
    .where(and(publishedWhere(siteId), eq(articles.slug, slug)))
    .limit(1);
  return row ? buildPublicArticle(siteId, row) : null;
}

export async function loadSections(siteId: string): Promise<Section[]> {
  return db
    .select()
    .from(sections)
    .where(and(eq(sections.siteId, siteId), eq(sections.isActive, true)))
    .orderBy(asc(sections.sortOrder), asc(sections.name));
}

export async function loadMenus(siteId: string): Promise<Record<string, MenuItem[]>> {
  const rows = await db
    .select({ key: menus.key, items: menus.items })
    .from(menus)
    .where(eq(menus.siteId, siteId));
  const out: Record<string, MenuItem[]> = {};
  for (const r of rows) {
    const items = Array.isArray(r.items) ? r.items : [];
    out[r.key] = items.map((it) => menuItemSchema.safeParse(it)).flatMap((p) => (p.success ? [p.data] : []));
  }
  return out;
}

export async function loadTagBySlug(siteId: string, slug: string): Promise<Tag | null> {
  const [row] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.siteId, siteId), eq(tags.slug, slug)))
    .limit(1);
  return row ?? null;
}

export async function loadAuthorBySlug(siteId: string, slug: string): Promise<PublicAuthor | null> {
  const [row] = await db
    .select({ author: authors, image: media })
    .from(authors)
    .leftJoin(media, eq(media.id, authors.imageMediaId))
    .where(and(eq(authors.siteId, siteId), eq(authors.slug, slug), eq(authors.isActive, true)))
    .limit(1);
  return row ? { ...row.author, image: liveMedia(row.image) } : null;
}

export async function loadBreaking(siteId: string, limit = 3): Promise<ArticleTeaser[]> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows = await teaserSelect()
    .where(and(publishedWhere(siteId), eq(articles.isBreaking, true), gte(articles.publishedAt, since)))
    .orderBy(desc(articles.publishedAt))
    .limit(clampLimit(limit, 10));
  return withBylines(rows);
}

export async function loadSearch(
  siteId: string,
  q: string,
  opts: { limit: number; offset: number },
): Promise<SearchResult> {
  const term = q.trim().slice(0, 200);
  const limit = clampLimit(opts.limit, SEARCH_MAX_LIMIT);
  if (term.length < 2 || limit === 0) return { items: [], total: 0 };
  const query = sql`websearch_to_tsquery('norwegian', ${term})`;
  const where = and(publishedWhere(siteId), sql`${articles.search} @@ ${query}`) as SQL;
  const source = sql`coalesce(${articles.lead}, '') || ' ' || coalesce(${articles.bodyText}, '')`;

  const [[countRow], rows] = await Promise.all([
    db.select({ total: count() }).from(articles).where(where),
    db
      .select({
        ...teaserColumns,
        rank: sql<number>`ts_rank(${articles.search}, ${query})`,
        headline: sql<string>`ts_headline('norwegian', ${source}, ${query}, ${HEADLINE_OPTIONS})`,
      })
      .from(articles)
      .leftJoin(sections, eq(sections.id, articles.sectionId))
      .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
      .leftJoin(media, eq(media.id, articles.featuredMediaId))
      .where(where)
      .orderBy(desc(sql`ts_rank(${articles.search}, ${query})`), desc(articles.publishedAt))
      .limit(limit)
      .offset(Math.max(0, Math.floor(opts.offset))),
  ]);
  const teasers = await withBylines(rows);
  const items: SearchHit[] = teasers.map((t, i) => ({
    ...t,
    rank: Number(rows[i]?.rank ?? 0),
    headline: parseHeadline(rows[i]?.headline ?? ''),
  }));
  return { items, total: countRow?.total ?? 0 };
}

/** Split a ts_headline string into plain/highlighted segments (no HTML involved). */
export function parseHeadline(raw: string): HeadlineSegment[] {
  const out: HeadlineSegment[] = [];
  let buffer = '';
  let highlight = false;
  for (const ch of raw) {
    if (ch === HL_START || ch === HL_STOP) {
      if (buffer) out.push({ text: buffer, highlight });
      buffer = '';
      highlight = ch === HL_START;
      continue;
    }
    buffer += ch;
  }
  if (buffer) out.push({ text: buffer, highlight });
  return out;
}

export async function loadSitemapArticles(siteId: string): Promise<SitemapArticle[]> {
  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      sectionSlug: sections.slug,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      noIndex: articles.noIndex,
    })
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .where(publishedWhere(siteId))
    .orderBy(desc(articles.publishedAt));
}

export async function loadFeedArticles(
  siteId: string,
  q: { sectionId?: string; limit: number },
): Promise<FeedArticle[]> {
  const teasers = await loadTeasers(siteId, { sectionId: q.sectionId, limit: q.limit });
  if (!teasers.length) return [];
  const ids = teasers.map((t) => t.id);
  const rows = await db
    .select({ id: articles.id, body: articles.body, seoDescription: articles.seoDescription })
    .from(articles)
    .where(inArray(articles.id, ids));
  const tagRows = await db
    .select({ articleId: articleTags.articleId, name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(inArray(articleTags.articleId, ids));
  const tagsByArticle = new Map<string, string[]>();
  for (const r of tagRows)
    tagsByArticle.set(r.articleId, [...(tagsByArticle.get(r.articleId) ?? []), r.name]);

  const bodies = new Map(
    rows.map((r) => [r.id, { body: sanitizeDoc(r.body), seoDescription: r.seoDescription }]),
  );
  const mediaIds = new Set<string>();
  const articleIds = new Set<string>();
  for (const { body } of bodies.values()) {
    for (const id of docMediaIds(body)) mediaIds.add(id);
    for (const id of docArticleIds(body)) articleIds.add(id);
  }
  const [mediaMap, bodyTeasers] = await Promise.all([
    getMediaMany(siteId, [...mediaIds]),
    loadTeasersByIds(siteId, [...articleIds]),
  ]);
  const teaserById = new Map(bodyTeasers.map((t) => [t.id, t]));

  return teasers.map((t) => {
    const extra = bodies.get(t.id);
    const body = extra?.body ?? { type: 'doc', content: [] };
    const bodyMedia: Record<string, Media> = {};
    for (const id of docMediaIds(body)) {
      const m = mediaMap.get(id);
      if (m) bodyMedia[id] = m;
    }
    const bodyArticles: Record<string, ArticleTeaser> = {};
    for (const id of docArticleIds(body)) {
      const a = teaserById.get(id);
      if (a) bodyArticles[id] = a;
    }
    return {
      ...t,
      body,
      seoDescription: extra?.seoDescription ?? null,
      tags: tagsByArticle.get(t.id) ?? [],
      bodyMedia,
      bodyArticles,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Layouts                                                                    */
/* -------------------------------------------------------------------------- */

/** LayoutSource over the raw loaders (SPEC 4.6). */
export function layoutSource(siteId: string): LayoutSource {
  return {
    byIds: (ids) => loadTeasersByIds(siteId, ids),
    query: (q: LayoutQuery) =>
      loadTeasers(siteId, {
        sectionId: q.sectionId,
        tagId: q.tagId,
        contentTypeKey: q.contentTypeKey,
        access: q.access,
        limit: q.limit,
        exclude: [...q.exclude],
        order: q.order,
        days: q.mostReadDays,
      }),
    liveBlogs: () => loadLiveBlogs(siteId),
    media: (ids) => getMediaMany(siteId, ids),
  };
}

async function loadPublishedLayoutDoc(siteId: string, key: string): Promise<LayoutDoc | null> {
  const [row] = await db
    .select({ published: layouts.published })
    .from(layouts)
    .where(and(eq(layouts.siteId, siteId), eq(layouts.key, key)))
    .limit(1);
  if (!row?.published) return null;
  const doc = parseLayoutDoc(row.published);
  return doc.rows.length ? doc : null;
}

export async function loadFrontLayout(siteId: string): Promise<ResolvedLayout> {
  const doc =
    (await loadPublishedLayoutDoc(siteId, 'front')) ?? defaultFrontLayout(await loadSections(siteId));
  return resolveLayout(doc, layoutSource(siteId));
}

export async function loadSectionLayout(siteId: string, sectionId: string): Promise<ResolvedLayout | null> {
  const doc = await loadPublishedLayoutDoc(siteId, `section:${sectionId}`);
  if (!doc) return null;
  return resolveLayout(doc, layoutSource(siteId));
}

/* -------------------------------------------------------------------------- */
/*  Cached public API (SPEC 4.8)                                               */
/* -------------------------------------------------------------------------- */

export async function getArticleByPath(
  siteId: string,
  sectionSlug: string,
  slug: string,
): Promise<PublicArticle | null> {
  return cachedRead(loadArticleByPath, ['public', 'article-by-path'], { siteId })(siteId, sectionSlug, slug);
}

export async function getArticleById(siteId: string, id: string): Promise<PublicArticle | null> {
  return cachedRead(loadArticleById, ['public', 'article-by-id'], { siteId, tags: [cacheTags.article(id)] })(
    siteId,
    id,
  );
}

export async function getArticleBySlug(siteId: string, slug: string): Promise<PublicArticle | null> {
  return cachedRead(loadArticleBySlug, ['public', 'article-by-slug'], { siteId })(siteId, slug);
}

export async function listTeasers(siteId: string, q: TeaserQuery): Promise<ArticleTeaser[]> {
  const tagList = q.sectionId ? [cacheTags.section(q.sectionId)] : [];
  return cachedRead(loadTeasers, ['public', 'teasers'], { siteId, tags: tagList })(siteId, q);
}

export async function countTeasers(
  siteId: string,
  q: Omit<TeaserQuery, 'limit' | 'offset'>,
): Promise<number> {
  return cachedRead(loadTeaserCount, ['public', 'teaser-count'], { siteId })(siteId, q);
}

export async function searchArticles(
  siteId: string,
  q: string,
  opts: { limit: number; offset: number },
): Promise<SearchResult> {
  return cachedRead(loadSearch, ['public', 'search'], { siteId })(siteId, q, opts);
}

export async function getFrontLayout(siteId: string): Promise<ResolvedLayout> {
  return cachedRead(loadFrontLayout, ['public', 'front-layout'], {
    siteId,
    tags: [cacheTags.layout(siteId)],
  })(siteId);
}

export async function getSectionLayout(siteId: string, sectionId: string): Promise<ResolvedLayout | null> {
  return cachedRead(loadSectionLayout, ['public', 'section-layout'], {
    siteId,
    tags: [cacheTags.layout(siteId), cacheTags.section(sectionId)],
  })(siteId, sectionId);
}

export async function listSections(siteId: string): Promise<Section[]> {
  return cachedRead(loadSections, ['public', 'sections'], { siteId })(siteId);
}

export async function getSectionBySlug(siteId: string, slug: string): Promise<Section | null> {
  const all = await listSections(siteId);
  return all.find((s) => s.slug === slug) ?? null;
}

export async function getMenus(siteId: string): Promise<Record<string, MenuItem[]>> {
  return cachedRead(loadMenus, ['public', 'menus'], { siteId })(siteId);
}

export async function getTagBySlug(siteId: string, slug: string): Promise<Tag | null> {
  return cachedRead(loadTagBySlug, ['public', 'tag'], { siteId })(siteId, slug);
}

export async function getAuthorBySlug(siteId: string, slug: string): Promise<PublicAuthor | null> {
  return cachedRead(loadAuthorBySlug, ['public', 'author'], { siteId })(siteId, slug);
}

/** Other articles from the same section, newest first, never the article itself. */
export async function getRelated(
  siteId: string,
  article: { id: string; sectionId: string | null },
  limit = 4,
): Promise<ArticleTeaser[]> {
  if (!article.sectionId) return [];
  return listTeasers(siteId, { sectionId: article.sectionId, limit, exclude: [article.id] });
}

/** Breaking stories published in the last 24 hours. */
export async function getBreaking(siteId: string): Promise<ArticleTeaser[]> {
  return cachedRead(loadBreaking, ['public', 'breaking'], { siteId, revalidate: 30 })(siteId);
}

export async function listLiveBlogs(siteId: string): Promise<LiveBlogSummary[]> {
  return cachedRead(loadLiveBlogs, ['public', 'live-blogs'], { siteId, revalidate: 30 })(siteId);
}

export async function listSitemapArticles(siteId: string): Promise<SitemapArticle[]> {
  return cachedRead(loadSitemapArticles, ['public', 'sitemap'], { siteId })(siteId);
}

export async function listFeedArticles(
  siteId: string,
  q: { sectionId?: string; limit: number },
): Promise<FeedArticle[]> {
  return cachedRead(loadFeedArticles, ['public', 'feed'], { siteId })(siteId, q);
}

/**
 * Any-status article for the admin preview (never cached, never used by
 * public routes). Related/body references still resolve to published
 * articles only, exactly as readers would see them.
 */
export async function getArticleForPreview(siteId: string, id: string): Promise<PublicArticle | null> {
  const [row] = await articleSelect()
    .where(and(eq(articles.siteId, siteId), eq(articles.id, id), isNull(articles.deletedAt)))
    .limit(1);
  return row ? buildPublicArticle(siteId, row) : null;
}
