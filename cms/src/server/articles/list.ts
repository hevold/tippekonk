/**
 * Admin article list ("Saker"): filtering, searching, sorting and paging
 * articles for /admin/artikler, plus the per-status counts shown on the
 * status tabs and the option lists the filter bar needs.
 *
 *   const filter = parseArticleListFilter(searchParams);
 *   const page = await listArticles(ctx, filter);           // { items, total, page, pageCount }
 *   const counts = await countArticlesByTab(ctx, filter);   // { all, mine, draft, …, trash }
 *
 * Scoping: contributors (article:edit_own without article:edit_any) only ever
 * see the articles they created — the filter is applied server-side here so
 * no client can widen it. Search combines the weighted Norwegian tsvector
 * (`websearch_to_tsquery('norwegian', q)`) with an ILIKE fallback on the
 * title so partial words and names still match.
 */
import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { db } from '@/db';
import {
  articleBylines,
  articleTags,
  articles,
  authors,
  contentTypes,
  memberships,
  sections,
  users,
  type ArticleAccess,
  type ArticleStatus,
} from '@/db/schema';
import { articleFilterSchema, parseArticleSort, type ArticleSortField } from '@/lib/validation/article';
import { nullableDate } from '@/lib/validation/common';
import type { AdminContext } from '@/server/auth/context';

/* -------------------------------------------------------------------------- */
/*  Filter                                                                     */
/* -------------------------------------------------------------------------- */

export const LIST_PAGE_SIZE = 25;

/** The status tabs of the list page, in display order. */
export const LIST_TABS = [
  'all',
  'mine',
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'unpublished',
  'archived',
  'trash',
] as const;
export type ListTab = (typeof LIST_TABS)[number];

/** URL filter for the list: the shared article filter plus an optional date range. */
export const articleListFilterSchema = articleFilterSchema.extend({
  from: nullableDate.optional(),
  to: nullableDate.optional(),
});
export type ArticleListFilter = z.infer<typeof articleListFilterSchema>;

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parse Next.js search params leniently: invalid values fall back to the defaults instead of erroring. */
export function parseArticleListFilter(params: RawParams): ArticleListFilter {
  const raw = {
    status: first(params.status),
    sectionId: first(params.sectionId),
    contentTypeId: first(params.contentTypeId),
    tagId: first(params.tagId),
    q: first(params.q),
    authorId: first(params.authorId),
    assignedTo: first(params.assignedTo),
    access: first(params.access),
    sort: first(params.sort),
    page: first(params.page),
    perPage: first(params.perPage) ?? String(LIST_PAGE_SIZE),
    from: first(params.from),
    to: first(params.to),
  };
  const parsed = articleListFilterSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Drop the offending keys and parse again so one bad param does not blank the whole list.
  const bad = new Set(parsed.error.issues.map((i) => String(i.path[0])));
  const cleaned = Object.fromEntries(Object.entries(raw).filter(([k]) => !bad.has(k)));
  const second = articleListFilterSchema.safeParse(cleaned);
  return second.success ? second.data : articleListFilterSchema.parse({ perPage: LIST_PAGE_SIZE });
}

/** The tab a filter's `status` value selects. */
export function tabFor(status: ArticleListFilter['status']): ListTab {
  if (!status) return 'all';
  return status as ListTab;
}

/** Whether the current user only sees their own articles (SPEC 5.1: contributors). Viewers read everything. */
export function isOwnScoped(ctx: Pick<AdminContext, 'can'>): boolean {
  return ctx.can('article:edit_own') && !ctx.can('article:edit_any');
}

/* -------------------------------------------------------------------------- */
/*  Rows                                                                      */
/* -------------------------------------------------------------------------- */

export type ArticleListByline = { id: string; name: string };

export type ArticleListRow = {
  id: string;
  title: string;
  kicker: string | null;
  slug: string;
  status: ArticleStatus;
  access: ArticleAccess;
  isBreaking: boolean;
  isSponsored: boolean;
  sectionId: string | null;
  sectionName: string | null;
  sectionSlug: string | null;
  contentTypeId: string;
  contentTypeName: string | null;
  contentTypeKey: string | null;
  updatedAt: Date;
  updatedByName: string | null;
  createdAt: Date;
  createdBy: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  assignedTo: string | null;
  assignedToName: string | null;
  deadlineAt: Date | null;
  plannedAt: Date | null;
  deletedAt: Date | null;
  wordCount: number;
  bylines: ArticleListByline[];
};

export type ArticleListPage = {
  items: ArticleListRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

export type ListTabCounts = Record<ListTab, number>;

const updater = alias(users, 'updater');
const assignee = alias(users, 'assignee');

/** Escape LIKE wildcards so a search for "100%" does not match everything. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

/** Every filter clause except status/trash — shared by the list query and the tab counts. */
async function commonClauses(ctx: AdminContext, filter: ArticleListFilter): Promise<SQL[]> {
  const clauses: SQL[] = [eq(articles.siteId, ctx.site.id)];
  if (isOwnScoped(ctx)) clauses.push(eq(articles.createdBy, ctx.user.id));

  const q = filter.q?.trim();
  if (q) {
    const textMatch = or(
      sql`${articles.search} @@ websearch_to_tsquery('norwegian', ${q})`,
      ilike(articles.title, likePattern(q)),
    );
    if (textMatch) clauses.push(textMatch);
  }
  if (filter.sectionId) {
    // Filtering by a parent section includes its direct children (Meninger → Debatt).
    const children = await db
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.siteId, ctx.site.id), eq(sections.parentId, filter.sectionId)));
    const ids = [filter.sectionId, ...children.map((c) => c.id)];
    clauses.push(
      ids.length === 1 ? eq(articles.sectionId, filter.sectionId) : inArray(articles.sectionId, ids),
    );
  }
  if (filter.contentTypeId) clauses.push(eq(articles.contentTypeId, filter.contentTypeId));
  if (filter.assignedTo) clauses.push(eq(articles.assignedTo, filter.assignedTo));
  if (filter.access) clauses.push(eq(articles.access, filter.access));
  if (filter.tagId) {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(articleTags)
          .where(and(eq(articleTags.articleId, articles.id), eq(articleTags.tagId, filter.tagId))),
      ),
    );
  }
  if (filter.authorId) {
    clauses.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(articleBylines)
          .where(
            and(eq(articleBylines.articleId, articles.id), eq(articleBylines.authorId, filter.authorId)),
          ),
      ),
    );
  }
  // The date range applies to the publish date on the "Publisert" tab and to the last change elsewhere.
  const dateColumn = filter.status === 'published' ? articles.publishedAt : articles.updatedAt;
  if (filter.from) clauses.push(gte(dateColumn, filter.from));
  if (filter.to) clauses.push(lte(dateColumn, filter.to));
  return clauses;
}

function statusClause(ctx: AdminContext, status: ArticleListFilter['status']): SQL {
  if (status === 'trash') return isNotNull(articles.deletedAt);
  const live = isNull(articles.deletedAt);
  if (status === 'mine') {
    const mine = or(eq(articles.assignedTo, ctx.user.id), eq(articles.createdBy, ctx.user.id));
    return and(live, mine) ?? live;
  }
  if (status) return and(live, eq(articles.status, status)) ?? live;
  return live;
}

const SORT_COLUMNS: Record<ArticleSortField, PgColumn> = {
  updatedAt: articles.updatedAt,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  deadlineAt: articles.deadlineAt,
  title: articles.title,
  status: articles.status,
};

function orderBy(sort: string): SQL[] {
  const { field, direction } = parseArticleSort(sort);
  const column = SORT_COLUMNS[field];
  const nullable = field === 'publishedAt' || field === 'deadlineAt';
  const primary =
    direction === 'desc'
      ? nullable
        ? sql`${column} DESC NULLS LAST`
        : desc(column)
      : nullable
        ? sql`${column} ASC NULLS LAST`
        : asc(column);
  return [primary, desc(articles.updatedAt), asc(articles.id)];
}

async function bylinesFor(articleIds: string[]): Promise<Map<string, ArticleListByline[]>> {
  const map = new Map<string, ArticleListByline[]>();
  if (articleIds.length === 0) return map;
  const rows = await db
    .select({
      articleId: articleBylines.articleId,
      id: authors.id,
      name: authors.name,
      sortOrder: articleBylines.sortOrder,
    })
    .from(articleBylines)
    .innerJoin(authors, eq(authors.id, articleBylines.authorId))
    .where(inArray(articleBylines.articleId, articleIds))
    .orderBy(asc(articleBylines.sortOrder), asc(authors.name));
  for (const r of rows) {
    const list = map.get(r.articleId) ?? [];
    list.push({ id: r.id, name: r.name });
    map.set(r.articleId, list);
  }
  return map;
}

/** The filtered, sorted, paged list. */
export async function listArticles(ctx: AdminContext, filter: ArticleListFilter): Promise<ArticleListPage> {
  const where = and(...(await commonClauses(ctx, filter)), statusClause(ctx, filter.status));
  const perPage = Math.min(Math.max(filter.perPage, 1), 100);

  const [totalRow] = await db.select({ value: count() }).from(articles).where(where);
  const total = totalRow?.value ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(filter.page, 1), pageCount);

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      kicker: articles.kicker,
      slug: articles.slug,
      status: articles.status,
      access: articles.access,
      isBreaking: articles.isBreaking,
      isSponsored: articles.isSponsored,
      sectionId: articles.sectionId,
      sectionName: sections.name,
      sectionSlug: sections.slug,
      contentTypeId: articles.contentTypeId,
      contentTypeName: contentTypes.name,
      contentTypeKey: contentTypes.key,
      updatedAt: articles.updatedAt,
      updatedByName: updater.name,
      createdAt: articles.createdAt,
      createdBy: articles.createdBy,
      publishedAt: articles.publishedAt,
      scheduledAt: articles.scheduledAt,
      assignedTo: articles.assignedTo,
      assignedToName: assignee.name,
      deadlineAt: articles.deadlineAt,
      plannedAt: articles.plannedAt,
      deletedAt: articles.deletedAt,
      wordCount: articles.wordCount,
    })
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(updater, eq(updater.id, articles.updatedBy))
    .leftJoin(assignee, eq(assignee.id, articles.assignedTo))
    .where(where)
    .orderBy(...orderBy(filter.sort))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const bylines = await bylinesFor(rows.map((r) => r.id));
  return {
    items: rows.map((r) => ({ ...r, bylines: bylines.get(r.id) ?? [] })),
    total,
    page,
    perPage,
    pageCount,
  };
}

/** Counts for the status tabs, honouring every filter except the status itself. */
export async function countArticlesByTab(
  ctx: AdminContext,
  filter: ArticleListFilter,
): Promise<ListTabCounts> {
  const common = await commonClauses(ctx, { ...filter, status: undefined });
  const live = and(...common, isNull(articles.deletedAt));
  const [byStatus, trashRow, mineRow] = await Promise.all([
    db
      .select({ status: articles.status, value: count() })
      .from(articles)
      .where(live)
      .groupBy(articles.status),
    db
      .select({ value: count() })
      .from(articles)
      .where(and(...common, isNotNull(articles.deletedAt))),
    db
      .select({ value: count() })
      .from(articles)
      .where(and(live, or(eq(articles.assignedTo, ctx.user.id), eq(articles.createdBy, ctx.user.id)))),
  ]);
  const counts: ListTabCounts = {
    all: 0,
    mine: mineRow[0]?.value ?? 0,
    draft: 0,
    in_review: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    unpublished: 0,
    archived: 0,
    trash: trashRow[0]?.value ?? 0,
  };
  for (const row of byStatus) {
    counts[row.status] = Number(row.value);
    counts.all += Number(row.value);
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/*  Filter options                                                             */
/* -------------------------------------------------------------------------- */

export type ListOption = { id: string; name: string };
export type SectionOption = ListOption & { parentId: string | null; isActive: boolean };

export type ArticleListOptions = {
  sections: SectionOption[];
  contentTypes: ListOption[];
  authors: ListOption[];
  members: ListOption[];
};

/** Everything the filter bar needs to render its selects. */
export async function listArticleFilterOptions(siteId: string): Promise<ArticleListOptions> {
  const [sectionRows, typeRows, authorRows, memberRows] = await Promise.all([
    db
      .select({
        id: sections.id,
        name: sections.name,
        parentId: sections.parentId,
        isActive: sections.isActive,
      })
      .from(sections)
      .where(eq(sections.siteId, siteId))
      .orderBy(asc(sections.sortOrder), asc(sections.name)),
    db
      .select({ id: contentTypes.id, name: contentTypes.name })
      .from(contentTypes)
      .where(eq(contentTypes.siteId, siteId))
      .orderBy(asc(contentTypes.sortOrder), asc(contentTypes.name)),
    db
      .select({ id: authors.id, name: authors.name })
      .from(authors)
      .where(and(eq(authors.siteId, siteId), eq(authors.isActive, true)))
      .orderBy(asc(authors.sortOrder), asc(authors.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.siteId, siteId), eq(users.isActive, true)))
      .orderBy(asc(users.name)),
  ]);
  return {
    sections: orderSectionTree(sectionRows),
    contentTypes: typeRows,
    authors: authorRows,
    members: memberRows,
  };
}

/** Parents first, each followed by its children, so a select reads as a tree. */
export function orderSectionTree<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const parent = r.parentId && ids.has(r.parentId) ? r.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(r);
    byParent.set(parent, list);
  }
  const out: T[] = [];
  const walk = (parent: string | null) => {
    for (const r of byParent.get(parent) ?? []) {
      out.push(r);
      walk(r.id);
    }
  };
  walk(null);
  return out;
}
