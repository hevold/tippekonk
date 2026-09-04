/**
 * Media read queries (site-scoped). Used by the admin pages, the picker's
 * server action, the public renderer (via getMediaMany) and the article
 * service's publish validation.
 *
 *   listMedia(siteId, { q, kind, folder, page, trashed })   → { items, total, page, pageCount }
 *   getMedia(siteId, id) / getMediaMany(siteId, ids)
 *   listFolders(siteId)                                     → distinct folder names with counts
 *   mediaUsage(siteId, mediaId)                             → articles using the file (featured or in body)
 */
import 'server-only';

import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/db';
import { articles, media, type ArticleStatus, type Media, type MediaKind } from '@/db/schema';

export const MEDIA_PAGE_SIZE = 40;
export const MEDIA_MAX_PAGE_SIZE = 200;

export type ListMediaOptions = {
  q?: string;
  kind?: MediaKind;
  folder?: string;
  page?: number;
  perPage?: number;
  /** true → only trashed items; false/undefined → only live items. */
  trashed?: boolean;
};

export type MediaPage = {
  items: Media[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

/** Escape LIKE wildcards in user input so "100%" does not match everything. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function listFilters(siteId: string, opts: ListMediaOptions): SQL {
  const clauses: (SQL | undefined)[] = [
    eq(media.siteId, siteId),
    opts.trashed ? isNotNull(media.deletedAt) : isNull(media.deletedAt),
  ];
  if (opts.kind) clauses.push(eq(media.kind, opts.kind));
  if (opts.folder) clauses.push(eq(media.folder, opts.folder));
  const q = opts.q?.trim();
  if (q) {
    const pattern = likePattern(q);
    clauses.push(
      or(
        ilike(media.filename, pattern),
        ilike(media.alt, pattern),
        ilike(media.caption, pattern),
        ilike(media.credit, pattern),
        sql`array_to_string(${media.tags}, ' ') ILIKE ${pattern}`,
      ),
    );
  }
  return and(...clauses) as SQL;
}

export async function listMedia(siteId: string, opts: ListMediaOptions = {}): Promise<MediaPage> {
  const perPage = Math.min(MEDIA_MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.perPage ?? MEDIA_PAGE_SIZE)));
  const requestedPage = Math.max(1, Math.floor(opts.page ?? 1));
  const where = listFilters(siteId, opts);

  const [{ total }] = await db.select({ total: count() }).from(media).where(where);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, pageCount);

  const items = await db
    .select()
    .from(media)
    .where(where)
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { items, total, page, perPage, pageCount };
}

/** One media row by id, including trashed ones (the detail page shows a restore banner). */
export async function getMedia(siteId: string, id: string): Promise<Media | null> {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), eq(media.id, id)))
    .limit(1);
  return row ?? null;
}

/** Live (non-trashed) rows for a set of ids, keyed by id. Unknown ids are simply absent. */
export async function getMediaMany(siteId: string, ids: string[]): Promise<Map<string, Media>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.siteId, siteId), inArray(media.id, unique), isNull(media.deletedAt)));
  return new Map(rows.map((r) => [r.id, r]));
}

export type MediaFolder = { name: string; count: number };

/** Distinct folder names among live media, alphabetically, with item counts. */
export async function listFolders(siteId: string): Promise<MediaFolder[]> {
  const rows = await db
    .select({ name: media.folder, count: count() })
    .from(media)
    .where(and(eq(media.siteId, siteId), isNull(media.deletedAt), isNotNull(media.folder)))
    .groupBy(media.folder)
    .orderBy(asc(media.folder));
  return rows
    .filter((r): r is { name: string; count: number } => Boolean(r.name))
    .map((r) => ({ name: r.name, count: r.count }));
}

export type MediaUsage = {
  id: string;
  title: string;
  status: ArticleStatus;
  /** true when the file is the article's featured image. */
  featured: boolean;
  /** true when the file appears in the body (image/gallery node). */
  inBody: boolean;
};

/**
 * Articles referencing a media id, either as the featured image or anywhere
 * in the body document. The body check is a text search on the JSON, which
 * is cheap enough for a small newsroom and catches every node type.
 */
export async function mediaUsage(siteId: string, mediaId: string): Promise<MediaUsage[]> {
  const inBody = sql<boolean>`(${articles.body}::text ILIKE ${`%${mediaId}%`})`;
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      featuredMediaId: articles.featuredMediaId,
      inBody,
    })
    .from(articles)
    .where(
      and(
        eq(articles.siteId, siteId),
        isNull(articles.deletedAt),
        or(eq(articles.featuredMediaId, mediaId), inBody),
      ),
    )
    .orderBy(desc(articles.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    featured: r.featuredMediaId === mediaId,
    inBody: Boolean(r.inBody),
  }));
}

/** Usage counts for many ids at once (bulk-delete warnings). */
export async function mediaUsageCounts(siteId: string, mediaIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of new Set(mediaIds)) {
    const usage = await mediaUsage(siteId, id);
    if (usage.length) out.set(id, usage.length);
  }
  return out;
}

/** Number of trashed items (for the "Papirkurv (3)" tab). */
export async function countTrashedMedia(siteId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(media)
    .where(and(eq(media.siteId, siteId), isNotNull(media.deletedAt)));
  return total;
}
