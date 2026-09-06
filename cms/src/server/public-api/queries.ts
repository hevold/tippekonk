/**
 * Read queries for the public JSON API (/api/v1) and the layout editor's
 * preview source. Deliberately independent of `src/server/public/**` (which
 * caches for the website): API responses are cheap enough to read straight
 * from the database, and the layout preview must see scheduled articles
 * that the website would never show.
 *
 *   const { items, total } = await queryArticles(siteId, { q: 'budsjett', limit: 20, offset: 0 });
 *   const teasers = await articlesByIds(siteId, ids, ['published', 'scheduled']);
 *   const full = await getApiArticle(siteId, id);
 */
import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
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
  articleTags,
  articleViews,
  articles,
  authors,
  contentTypes,
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
  type ContentType,
  type Media,
  type Menu,
  type Section,
  type Tag,
} from '@/db/schema';
import { sanitizeDoc } from '@/lib/content/schema';
import { docArticleIds, docMediaIds } from '@/lib/content/text';
import type { ContentDoc } from '@/lib/content/types';
import type { ArticleTeaser, LiveBlogSummary } from '@/lib/layout/engine';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ApiByline = { id: string; name: string; slug: string; role: BylineRole; title: string | null };

/** A teaser plus the extra fields the API and the admin preview need. */
export type ApiTeaser = ArticleTeaser & {
  status: ArticleStatus;
  sectionId: string | null;
  scheduledAt: Date | null;
  firstPublishedAt: Date | null;
  bylines: ApiByline[];
  tags: Pick<Tag, 'id' | 'name' | 'slug'>[];
  wordCount: number;
};

export type ApiArticle = ApiTeaser & {
  body: ContentDoc;
  featuredCaption: string | null;
  featuredCredit: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  customFields: Record<string, unknown>;
  /** Media referenced by the body, keyed by id. */
  bodyMedia: Map<string, Media>;
  /** Teasers referenced by relatedArticles nodes, keyed by id. */
  bodyArticles: Map<string, ArticleTeaser>;
};

export type ArticleQuery = {
  sectionId?: string;
  tagId?: string;
  contentTypeKey?: string;
  access?: ArticleAccess;
  /** Free-text search (websearch syntax, Norwegian configuration). */
  q?: string;
  /** Only articles updated at or after this instant. */
  since?: Date;
  /** Which workflow states to include; default published only. */
  statuses?: ArticleStatus[];
  exclude?: string[];
  order?: 'published' | 'most-read' | 'updated';
  /** Most-read window in days. */
  days?: number;
  limit: number;
  offset?: number;
};

export const API_MAX_LIMIT = 100;

/* -------------------------------------------------------------------------- */
/*  Shared select                                                              */
/* -------------------------------------------------------------------------- */

const teaserColumns = {
  id: articles.id,
  title: articles.title,
  kicker: articles.kicker,
  lead: articles.lead,
  slug: articles.slug,
  status: articles.status,
  access: articles.access,
  sectionId: articles.sectionId,
  publishedAt: articles.publishedAt,
  firstPublishedAt: articles.firstPublishedAt,
  scheduledAt: articles.scheduledAt,
  updatedAt: articles.updatedAt,
  isBreaking: articles.isBreaking,
  isSponsored: articles.isSponsored,
  readingTimeMin: articles.readingTimeMin,
  wordCount: articles.wordCount,
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
  status: ArticleStatus;
  access: ArticleAccess;
  sectionId: string | null;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  scheduledAt: Date | null;
  updatedAt: Date;
  isBreaking: boolean;
  isSponsored: boolean;
  readingTimeMin: number;
  wordCount: number;
  sectionSlug: string | null;
  sectionName: string | null;
  contentTypeKey: string | null;
  featuredMedia: Media | null;
};

function liveMedia(m: Media | null | undefined): Media | null {
  return m && !m.deletedAt ? m : null;
}

function teaserSelect() {
  return db
    .select(teaserColumns)
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(media, eq(media.id, articles.featuredMediaId));
}

/** The website's visibility predicate: published, publish time passed, not trashed. */
export function publishedWhere(siteId: string): SQL {
  return and(
    eq(articles.siteId, siteId),
    eq(articles.status, 'published'),
    lte(articles.publishedAt, sql`now()`),
    isNull(articles.deletedAt),
  ) as SQL;
}

function statusWhere(siteId: string, statuses: ArticleStatus[] | undefined): SQL {
  const list = statuses && statuses.length ? statuses : ['published' as const];
  const clauses: SQL[] = [eq(articles.siteId, siteId), isNull(articles.deletedAt)];
  if (list.length === 1 && list[0] === 'published') {
    clauses.push(eq(articles.status, 'published'), lte(articles.publishedAt, sql`now()`));
  } else {
    // Published rows still need their publish time to have passed; other states are taken as-is.
    const parts: SQL[] = [];
    if (list.includes('published')) {
      parts.push(and(eq(articles.status, 'published'), lte(articles.publishedAt, sql`now()`)) as SQL);
    }
    const others = list.filter((s) => s !== 'published');
    if (others.length) parts.push(inArray(articles.status, others));
    clauses.push(or(...parts) as SQL);
  }
  return and(...clauses) as SQL;
}

async function bylinesFor(articleIds: string[]): Promise<Map<string, ApiByline[]>> {
  const out = new Map<string, ApiByline[]>();
  if (!articleIds.length) return out;
  const rows = await db
    .select({
      articleId: articleBylines.articleId,
      id: authors.id,
      name: authors.name,
      slug: authors.slug,
      title: authors.title,
      role: articleBylines.role,
    })
    .from(articleBylines)
    .innerJoin(authors, eq(authors.id, articleBylines.authorId))
    .where(inArray(articleBylines.articleId, articleIds))
    .orderBy(asc(articleBylines.sortOrder), asc(authors.name));
  for (const r of rows) {
    const list = out.get(r.articleId) ?? [];
    list.push({ id: r.id, name: r.name, slug: r.slug, title: r.title, role: r.role });
    out.set(r.articleId, list);
  }
  return out;
}

async function tagsFor(articleIds: string[]): Promise<Map<string, Pick<Tag, 'id' | 'name' | 'slug'>[]>> {
  const out = new Map<string, Pick<Tag, 'id' | 'name' | 'slug'>[]>();
  if (!articleIds.length) return out;
  const rows = await db
    .select({ articleId: articleTags.articleId, id: tags.id, name: tags.name, slug: tags.slug })
    .from(articleTags)
    .innerJoin(tags, eq(tags.id, articleTags.tagId))
    .where(inArray(articleTags.articleId, articleIds))
    .orderBy(asc(tags.name));
  for (const r of rows) {
    const list = out.get(r.articleId) ?? [];
    list.push({ id: r.id, name: r.name, slug: r.slug });
    out.set(r.articleId, list);
  }
  return out;
}

async function hydrate(rows: TeaserRow[]): Promise<ApiTeaser[]> {
  const ids = rows.map((r) => r.id);
  const [bylines, tagMap] = await Promise.all([bylinesFor(ids), tagsFor(ids)]);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kicker: row.kicker,
    lead: row.lead,
    slug: row.slug,
    status: row.status,
    sectionId: row.sectionId,
    sectionSlug: row.sectionSlug,
    sectionName: row.sectionName,
    access: row.access,
    publishedAt: row.publishedAt,
    firstPublishedAt: row.firstPublishedAt,
    scheduledAt: row.scheduledAt,
    updatedAt: row.updatedAt,
    isBreaking: row.isBreaking,
    isSponsored: row.isSponsored,
    contentTypeKey: row.contentTypeKey ?? 'article',
    featuredMedia: liveMedia(row.featuredMedia),
    bylines: bylines.get(row.id) ?? [],
    tags: tagMap.get(row.id) ?? [],
    readingTimeMin: Math.max(1, row.readingTimeMin || 1),
    wordCount: row.wordCount,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Article queries                                                            */
/* -------------------------------------------------------------------------- */

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function articleFilters(siteId: string, q: ArticleQuery): SQL {
  const clauses: (SQL | undefined)[] = [statusWhere(siteId, q.statuses)];
  if (q.sectionId) {
    // A section includes its direct child sections (Meninger → Debatt).
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
  if (q.contentTypeKey) clauses.push(eq(contentTypes.key, q.contentTypeKey));
  if (q.access) clauses.push(eq(articles.access, q.access));
  if (q.since) clauses.push(gte(articles.updatedAt, q.since));
  if (q.exclude && q.exclude.length) clauses.push(notInArray(articles.id, q.exclude));
  const term = q.q?.trim();
  if (term) {
    clauses.push(
      or(
        ilike(articles.title, `%${escapeLike(term)}%`),
        sql`${articles.search} @@ websearch_to_tsquery('norwegian', ${term})`,
      ),
    );
  }
  return and(...clauses) as SQL;
}

export function clampLimit(limit: number, max = API_MAX_LIMIT): number {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(max, Math.floor(limit));
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - Math.max(1, days) * 86_400_000).toISOString().slice(0, 10);
}

/** Paged article listing. `total` is the count matching the filters. */
export async function queryArticles(
  siteId: string,
  q: ArticleQuery,
): Promise<{ items: ApiTeaser[]; total: number }> {
  const limit = clampLimit(q.limit);
  const where = articleFilters(siteId, q);
  const offset = Math.max(0, Math.floor(q.offset ?? 0));

  const [{ total }] = await db
    .select({ total: count() })
    .from(articles)
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .where(where);
  if (limit === 0) return { items: [], total };

  let rows: TeaserRow[];
  if (q.order === 'most-read') {
    const views = db
      .select({
        articleId: articleViews.articleId,
        total: sql<number>`sum(${articleViews.views})`.as('total'),
      })
      .from(articleViews)
      .where(gte(articleViews.day, daysAgoIso(q.days ?? 7)))
      .groupBy(articleViews.articleId)
      .as('v');
    rows = await teaserSelect()
      .leftJoin(views, eq(views.articleId, articles.id))
      .where(where)
      .orderBy(desc(sql`coalesce(${views.total}, 0)`), desc(articles.publishedAt), desc(articles.id))
      .limit(limit)
      .offset(offset);
  } else if (q.order === 'updated') {
    rows = await teaserSelect()
      .where(where)
      .orderBy(desc(articles.updatedAt), desc(articles.id))
      .limit(limit)
      .offset(offset);
  } else {
    rows = await teaserSelect()
      .where(where)
      .orderBy(
        desc(sql`coalesce(${articles.publishedAt}, ${articles.scheduledAt}, ${articles.updatedAt})`),
        desc(articles.id),
      )
      .limit(limit)
      .offset(offset);
  }
  return { items: await hydrate(rows), total };
}

/** Teasers for a set of ids in the requested order; missing/invisible ids are skipped. */
export async function articlesByIds(
  siteId: string,
  ids: string[],
  statuses: ArticleStatus[] = ['published'],
): Promise<ApiTeaser[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const rows = await teaserSelect().where(and(statusWhere(siteId, statuses), inArray(articles.id, unique)));
  const teasers = await hydrate(rows);
  const byId = new Map(teasers.map((t) => [t.id, t]));
  return unique.map((id) => byId.get(id)).filter((t): t is ApiTeaser => Boolean(t));
}

/** A published article with body, referenced media and related teasers. */
export async function getApiArticle(siteId: string, id: string): Promise<ApiArticle | null> {
  const [row] = await db
    .select({
      ...teaserColumns,
      body: articles.body,
      featuredCaption: articles.featuredCaption,
      featuredCredit: articles.featuredCredit,
      seoTitle: articles.seoTitle,
      seoDescription: articles.seoDescription,
      canonicalUrl: articles.canonicalUrl,
      customFields: articles.customFields,
    })
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(media, eq(media.id, articles.featuredMediaId))
    .where(and(publishedWhere(siteId), eq(articles.id, id)))
    .limit(1);
  if (!row) return null;
  const [teaser] = await hydrate([row]);
  if (!teaser) return null;
  const body = sanitizeDoc(row.body);
  const mediaIds = docMediaIds(body);
  const relatedIds = docArticleIds(body);
  const [bodyMediaRows, bodyArticles] = await Promise.all([
    mediaIds.length
      ? db
          .select()
          .from(media)
          .where(and(eq(media.siteId, siteId), inArray(media.id, mediaIds), isNull(media.deletedAt)))
      : Promise.resolve([] as Media[]),
    relatedIds.length ? articlesByIds(siteId, relatedIds) : Promise.resolve([] as ApiTeaser[]),
  ]);
  return {
    ...teaser,
    body,
    featuredCaption: row.featuredCaption,
    featuredCredit: row.featuredCredit,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    customFields: row.customFields ?? {},
    bodyMedia: new Map(bodyMediaRows.map((m) => [m.id, m])),
    bodyArticles: new Map(bodyArticles.map((a) => [a.id, a])),
  };
}

/* -------------------------------------------------------------------------- */
/*  Taxonomy, authors, site                                                    */
/* -------------------------------------------------------------------------- */

export type SectionWithCount = Section & { articleCount: number };

export async function listApiSections(siteId: string): Promise<SectionWithCount[]> {
  const rows = await db
    .select({
      section: sections,
      articleCount: sql<number>`(select count(*) from ${articles} where ${articles.sectionId} = ${sections.id} and ${articles.status} = 'published' and ${articles.deletedAt} is null)::int`,
    })
    .from(sections)
    .where(and(eq(sections.siteId, siteId), eq(sections.isActive, true)))
    .orderBy(asc(sections.sortOrder), asc(sections.name));
  return rows.map((r) => ({ ...r.section, articleCount: r.articleCount }));
}

export async function getSectionBySlugOrId(siteId: string, value: string): Promise<Section | null> {
  const [row] = await db
    .select()
    .from(sections)
    .where(
      and(
        eq(sections.siteId, siteId),
        /^[0-9a-f-]{36}$/i.test(value) ? eq(sections.id, value) : eq(sections.slug, value.toLowerCase()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type TagWithCount = Tag & { articleCount: number };

export async function listApiTags(siteId: string): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      tag: tags,
      articleCount: sql<number>`(select count(*) from ${articleTags} join ${articles} on ${articles.id} = ${articleTags.articleId} where ${articleTags.tagId} = ${tags.id} and ${articles.status} = 'published' and ${articles.deletedAt} is null)::int`,
    })
    .from(tags)
    .where(eq(tags.siteId, siteId))
    .orderBy(asc(tags.name));
  return rows.map((r) => ({ ...r.tag, articleCount: r.articleCount }));
}

export async function getTagBySlugOrId(siteId: string, value: string): Promise<Tag | null> {
  const [row] = await db
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.siteId, siteId),
        /^[0-9a-f-]{36}$/i.test(value) ? eq(tags.id, value) : eq(tags.slug, value.toLowerCase()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type AuthorWithImage = Author & { image: Media | null; articleCount: number };

export async function listApiAuthors(siteId: string): Promise<AuthorWithImage[]> {
  const rows = await db
    .select({
      author: authors,
      image: media,
      articleCount: sql<number>`(select count(*) from ${articleBylines} join ${articles} on ${articles.id} = ${articleBylines.articleId} where ${articleBylines.authorId} = ${authors.id} and ${articles.status} = 'published' and ${articles.deletedAt} is null)::int`,
    })
    .from(authors)
    .leftJoin(media, eq(media.id, authors.imageMediaId))
    .where(and(eq(authors.siteId, siteId), eq(authors.isActive, true)))
    .orderBy(asc(authors.sortOrder), asc(authors.name));
  return rows.map((r) => ({ ...r.author, image: liveMedia(r.image), articleCount: r.articleCount }));
}

export async function listApiContentTypes(siteId: string): Promise<ContentType[]> {
  return db
    .select()
    .from(contentTypes)
    .where(and(eq(contentTypes.siteId, siteId), eq(contentTypes.isActive, true)))
    .orderBy(asc(contentTypes.sortOrder), asc(contentTypes.name));
}

export async function listApiMenus(siteId: string): Promise<Menu[]> {
  return db.select().from(menus).where(eq(menus.siteId, siteId)).orderBy(asc(menus.key));
}

/** Live blogs that are currently live, newest first (for 'live' layout blocks). */
export async function listLiveBlogSummaries(
  siteId: string,
  statuses: ('live' | 'ended' | 'draft')[] = ['live'],
): Promise<LiveBlogSummary[]> {
  const rows = await db
    .select({
      id: liveBlogs.id,
      title: liveBlogs.title,
      slug: liveBlogs.slug,
      description: liveBlogs.description,
      status: liveBlogs.status,
      startedAt: liveBlogs.startedAt,
      updatedAt: liveBlogs.updatedAt,
      postCount: sql<number>`(select count(*) from ${livePosts} where ${livePosts.liveBlogId} = ${liveBlogs.id} and ${livePosts.deletedAt} is null)::int`,
    })
    .from(liveBlogs)
    .where(and(eq(liveBlogs.siteId, siteId), inArray(liveBlogs.status, statuses)))
    .orderBy(desc(liveBlogs.startedAt), desc(liveBlogs.updatedAt));
  return rows;
}

/** Media rows for pinned-item image overrides. */
export async function mediaByIds(siteId: string, ids: string[]): Promise<Map<string, Media>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.id, unique), isNull(media.deletedAt)));
  return new Map(rows.map((m) => [m.id, m]));
}
