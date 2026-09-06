/**
 * Taxonomy reads for the admin: sections (as a tree with article counts),
 * tags (with counts and search) and authors (with counts, linked users and
 * photos). Everything is site-scoped; counts only include articles that are
 * not in the trash.
 */
import 'server-only';

import { and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  articleBylines,
  articleTags,
  articles,
  authors,
  media,
  memberships,
  sections,
  tags,
  users,
  type Author,
  type Media,
  type Section,
  type Tag,
} from '@/db/schema';

/* -------------------------------------------------------------------------- */
/*  Sections                                                                   */
/* -------------------------------------------------------------------------- */

export type SectionWithCount = Section & { articleCount: number; publishedCount: number };

export type TreeNode<T> = T & { children: TreeNode<T>[]; depth: number };
export type SectionNode = TreeNode<SectionWithCount>;

export async function listSectionsWithCounts(siteId: string): Promise<SectionWithCount[]> {
  const rows = await db
    .select({
      section: sections,
      articleCount: sql<number>`count(${articles.id})`.mapWith(Number),
      publishedCount:
        sql<number>`count(${articles.id}) filter (where ${articles.status} = 'published')`.mapWith(Number),
    })
    .from(sections)
    .leftJoin(articles, and(eq(articles.sectionId, sections.id), isNull(articles.deletedAt)))
    .where(eq(sections.siteId, siteId))
    .groupBy(sections.id)
    .orderBy(asc(sections.sortOrder), asc(sections.name));
  return rows.map((r) => ({ ...r.section, articleCount: r.articleCount, publishedCount: r.publishedCount }));
}

/** Build a tree from flat rows (input order is kept within each level); orphans become roots. Pure. */
export function buildSectionTree<T extends { id: string; parentId: string | null }>(
  rows: T[],
): TreeNode<T>[] {
  const ids = new Set(rows.map((r) => r.id));
  const nodes = new Map<string, TreeNode<T>>(rows.map((r) => [r.id, { ...r, children: [], depth: 0 }]));
  const roots: TreeNode<T>[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = node.parentId && ids.has(node.parentId) ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const setDepth = (list: TreeNode<T>[], depth: number) => {
    for (const n of list) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

export async function listSectionTree(siteId: string): Promise<SectionNode[]> {
  return buildSectionTree(await listSectionsWithCounts(siteId));
}

/** Flatten a tree depth-first (parents before children). Pure. */
export function flattenSectionTree<T extends { children: T[] }>(nodes: T[]): T[] {
  const out: T[] = [];
  const walk = (list: T[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export async function getSection(siteId: string, id: string): Promise<Section | null> {
  const [row] = await db
    .select()
    .from(sections)
    .where(and(eq(sections.siteId, siteId), eq(sections.id, id)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Tags                                                                       */
/* -------------------------------------------------------------------------- */

export type TagWithCount = Tag & { articleCount: number };

export type ListTagsOptions = { q?: string; sort?: 'name' | 'count' | 'newest' };

export async function listTagsWithCounts(
  siteId: string,
  opts: ListTagsOptions = {},
): Promise<TagWithCount[]> {
  const q = opts.q?.trim();
  const where = q
    ? and(
        eq(tags.siteId, siteId),
        or(ilike(tags.name, `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`), ilike(tags.slug, `%${q}%`)),
      )
    : eq(tags.siteId, siteId);
  const countExpr = sql<number>`count(${articles.id})`.mapWith(Number);
  const order =
    opts.sort === 'count'
      ? [desc(countExpr), asc(tags.name)]
      : opts.sort === 'newest'
        ? [desc(tags.createdAt), asc(tags.name)]
        : [asc(tags.name)];
  const rows = await db
    .select({ tag: tags, articleCount: countExpr })
    .from(tags)
    .leftJoin(articleTags, eq(articleTags.tagId, tags.id))
    .leftJoin(articles, and(eq(articles.id, articleTags.articleId), isNull(articles.deletedAt)))
    .where(where)
    .groupBy(tags.id)
    .orderBy(...order);
  return rows.map((r) => ({ ...r.tag, articleCount: r.articleCount }));
}

export async function getTag(siteId: string, id: string): Promise<Tag | null> {
  const [row] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.siteId, siteId), eq(tags.id, id)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Authors                                                                    */
/* -------------------------------------------------------------------------- */

export type AuthorWithCount = Author & {
  articleCount: number;
  userName: string | null;
  userEmail: string | null;
  image: Media | null;
};

export async function listAuthorsWithCounts(siteId: string): Promise<AuthorWithCount[]> {
  const rows = await db
    .select({
      author: authors,
      articleCount: sql<number>`count(${articles.id})`.mapWith(Number),
      userName: users.name,
      userEmail: users.email,
      image: media,
    })
    .from(authors)
    .leftJoin(articleBylines, eq(articleBylines.authorId, authors.id))
    .leftJoin(articles, and(eq(articles.id, articleBylines.articleId), isNull(articles.deletedAt)))
    .leftJoin(users, eq(users.id, authors.userId))
    .leftJoin(media, eq(media.id, authors.imageMediaId))
    .where(eq(authors.siteId, siteId))
    .groupBy(authors.id, users.id, media.id)
    .orderBy(asc(authors.sortOrder), asc(authors.name));
  return rows.map((r) => ({
    ...r.author,
    articleCount: r.articleCount,
    userName: r.userName,
    userEmail: r.userEmail,
    image: r.image,
  }));
}

export async function getAuthor(siteId: string, id: string): Promise<Author | null> {
  const [row] = await db
    .select()
    .from(authors)
    .where(and(eq(authors.siteId, siteId), eq(authors.id, id)))
    .limit(1);
  return row ?? null;
}

export type MemberOption = { id: string; name: string; email: string };

/** Site members that can be linked to an author profile. */
export async function listMemberOptions(siteId: string): Promise<MemberOption[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.siteId, siteId), eq(users.isActive, true)))
    .orderBy(asc(users.name));
}

/** Number of live articles per section/tag/author, for delete guards. */
export async function countSectionArticles(sectionId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(articles)
    .where(and(eq(articles.sectionId, sectionId), isNull(articles.deletedAt)));
  return row?.value ?? 0;
}
