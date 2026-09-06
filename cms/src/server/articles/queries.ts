/**
 * Single-article reads for the editor page. The newsroom area owns the
 * list/filter queries (list.ts); this module builds the `ArticleEditModel`
 * — everything the editor needs in one round trip — plus the small lookups
 * the sidebar and pickers use (site members, article search, titles).
 */
import 'server-only';

import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  articleNotes,
  articles,
  authors,
  contentTypes,
  memberships,
  sections,
  tags,
  users,
  type Article,
  type ArticleStatus,
  type BylineRole,
  type ContentType,
  type Media,
} from '@/db/schema';
import { docMediaIds } from '@/lib/content/text';
import type { FieldDef } from '@/lib/validation/site';
import { ForbiddenError, NotFoundError } from '@/server/actions';
import type { AdminContext } from '@/server/auth/context';
import { getMediaMany } from '@/server/media/queries';

import { lockState, type LockState } from './locks';
import { canEditArticle, canonicalPath, loadArticle, loadRelations, SLUG_LOCKED_FLAG } from './mutations';
import { countRevisions, listRevisions, type RevisionSummary } from './revisions';
import { allowedTransitions, validateForPublish, type PublishIssue } from './validation';

export type EditorPerson = { id: string; name: string };

export type EditorSection = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean };
export type EditorTag = { id: string; name: string; slug: string };
export type EditorAuthor = { id: string; name: string; userId: string | null; title: string | null };
export type EditorContentType = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  fields: FieldDef[];
  isActive: boolean;
  isDefault: boolean;
};
export type EditorRelated = { id: string; title: string; status: ArticleStatus };
export type EditorNote = {
  id: string;
  body: string;
  user: EditorPerson | null;
  createdAt: Date;
  resolvedAt: Date | null;
};
export type EditorChecklistItem = {
  id: string;
  label: string;
  required: boolean;
  vvpRef?: string;
  help?: string;
  checked: boolean;
};
/** The image rows the publish preview needs (featured + body), keyed by id. */
export type EditorMediaInfo = Pick<
  Media,
  'id' | 'alt' | 'credit' | 'caption' | 'filename' | 'storageKey' | 'variants' | 'kind' | 'mime' | 'width' | 'height' | 'focalX' | 'focalY' | 'dominantColor'
>;

export type ArticleEditModel = {
  article: Article;
  contentType: EditorContentType;
  contentTypes: EditorContentType[];
  section: EditorSection | null;
  sections: EditorSection[];
  tagIds: string[];
  tagOptions: EditorTag[];
  bylines: { authorId: string; role: BylineRole }[];
  authorOptions: EditorAuthor[];
  related: EditorRelated[];
  featuredMedia: Media | null;
  /** Media rows referenced by the body, keyed by id (for alt/credit checks and the picker). */
  bodyMedia: Record<string, EditorMediaInfo>;
  revisions: { count: number; latest: RevisionSummary | null };
  notes: EditorNote[];
  lock: LockState;
  checklist: { enabled: boolean; items: EditorChecklistItem[] };
  members: EditorPerson[];
  createdBy: EditorPerson | null;
  updatedBy: EditorPerson | null;
  assignedTo: EditorPerson | null;
  publicPath: string;
  slugLocked: boolean;
  publishIssues: PublishIssue[];
  permissions: {
    edit: boolean;
    publish: boolean;
    review: boolean;
    delete: boolean;
    editAny: boolean;
    create: boolean;
  };
  allowedTransitions: ArticleStatus[];
};

function toContentType(row: ContentType): EditorContentType {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    fields: Array.isArray(row.fields) ? row.fields : [],
    isActive: row.isActive,
    isDefault: row.isDefault,
  };
}

async function person(id: string | null): Promise<EditorPerson | null> {
  if (!id) return null;
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return u ?? null;
}

/** Members of the site (for the "Tildelt" select), alphabetically. */
export async function listSiteMembers(siteId: string): Promise<EditorPerson[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.siteId, siteId))
    .orderBy(asc(users.name));
  return rows.filter((r) => r.isActive).map((r) => ({ id: r.id, name: r.name }));
}

export async function listSections(siteId: string): Promise<EditorSection[]> {
  const rows = await db
    .select({
      id: sections.id,
      name: sections.name,
      slug: sections.slug,
      parentId: sections.parentId,
      isActive: sections.isActive,
    })
    .from(sections)
    .where(eq(sections.siteId, siteId))
    .orderBy(asc(sections.sortOrder), asc(sections.name));
  return rows;
}

export async function listTagOptions(siteId: string): Promise<EditorTag[]> {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.siteId, siteId))
    .orderBy(asc(tags.name));
}

export async function listAuthorOptions(siteId: string): Promise<EditorAuthor[]> {
  const rows = await db
    .select({ id: authors.id, name: authors.name, userId: authors.userId, title: authors.title, isActive: authors.isActive })
    .from(authors)
    .where(eq(authors.siteId, siteId))
    .orderBy(asc(authors.sortOrder), asc(authors.name));
  return rows.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, userId: a.userId, title: a.title }));
}

export async function listContentTypes(siteId: string): Promise<EditorContentType[]> {
  const rows = await db
    .select()
    .from(contentTypes)
    .where(eq(contentTypes.siteId, siteId))
    .orderBy(asc(contentTypes.sortOrder), asc(contentTypes.name));
  return rows.map(toContentType);
}

export async function listNotes(articleId: string): Promise<EditorNote[]> {
  const rows = await db
    .select({
      id: articleNotes.id,
      body: articleNotes.body,
      createdAt: articleNotes.createdAt,
      resolvedAt: articleNotes.resolvedAt,
      userId: users.id,
      userName: users.name,
    })
    .from(articleNotes)
    .leftJoin(users, eq(users.id, articleNotes.userId))
    .where(eq(articleNotes.articleId, articleId))
    .orderBy(asc(articleNotes.createdAt));
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    user: r.userId && r.userName ? { id: r.userId, name: r.userName } : null,
  }));
}

/** Titles/statuses for a set of article ids (related articles, pickers). */
export async function getArticleTitles(siteId: string, ids: string[]): Promise<EditorRelated[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: articles.id, title: articles.title, status: articles.status })
    .from(articles)
    .where(and(eq(articles.siteId, siteId), inArray(articles.id, unique), isNull(articles.deletedAt)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique.map((id) => byId.get(id)).filter((r): r is EditorRelated => Boolean(r));
}

export type PickerArticle = { id: string; title: string; status: ArticleStatus; sectionName: string | null };

/** Search by title (and full-text) for article pickers; excludes trashed articles. */
export async function searchArticlesForPicker(
  siteId: string,
  q: string,
  opts: { limit?: number; excludeId?: string; publishedOnly?: boolean } = {},
): Promise<PickerArticle[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const term = q.trim();
  const clauses = [eq(articles.siteId, siteId), isNull(articles.deletedAt)];
  if (opts.excludeId) clauses.push(sql`${articles.id} <> ${opts.excludeId}`);
  if (opts.publishedOnly) clauses.push(eq(articles.status, 'published'));
  if (term) {
    const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(
      or(
        ilike(articles.title, pattern),
        sql`${articles.search} @@ websearch_to_tsquery('norwegian', ${term})`,
      )!,
    );
  }
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      sectionName: sections.name,
    })
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .where(and(...clauses))
    .orderBy(desc(articles.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, title: r.title || '(Uten tittel)' }));
}

/** The article row for the editor, enforcing site scope and the contributor "own articles only" rule. */
export async function getEditableArticle(ctx: AdminContext, id: string, opts: { includeTrashed?: boolean } = {}): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id, { includeTrashed: opts.includeTrashed });
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (!canEditArticle(ctx, article) && !ctx.can('article:review')) {
    throw new ForbiddenError('Du har ikke tilgang til denne saken.');
  }
  return article;
}

/** Everything the editor page needs (SPEC 4.7 getArticleForEdit). */
export async function getArticleForEdit(ctx: AdminContext, id: string): Promise<ArticleEditModel> {
  const article = await getEditableArticle(ctx, id, { includeTrashed: true });
  const relations = await loadRelations(db, article.id);

  const [allContentTypes, allSections, tagOptions, authorOptions, related, notes, revisionCount, revisions, members, lock, createdBy, updatedBy, assignedTo, publicPath] =
    await Promise.all([
      listContentTypes(ctx.site.id),
      listSections(ctx.site.id),
      listTagOptions(ctx.site.id),
      listAuthorOptions(ctx.site.id),
      getArticleTitles(ctx.site.id, relations.relatedIds),
      listNotes(article.id),
      countRevisions(article.id),
      listRevisions(article.id, 1),
      listSiteMembers(ctx.site.id),
      lockState(ctx, article),
      person(article.createdBy),
      person(article.updatedBy),
      person(article.assignedTo),
      canonicalPath(db, article),
    ]);

  const mediaIds = [...docMediaIds(article.body), ...(article.featuredMediaId ? [article.featuredMediaId] : [])];
  const mediaMap = await getMediaMany(ctx.site.id, mediaIds);
  const featuredMedia = article.featuredMediaId ? (mediaMap.get(article.featuredMediaId) ?? null) : null;
  const bodyMedia: Record<string, EditorMediaInfo> = {};
  for (const [mid, m] of mediaMap) {
    bodyMedia[mid] = {
      id: m.id,
      alt: m.alt,
      credit: m.credit,
      caption: m.caption,
      filename: m.filename,
      storageKey: m.storageKey,
      variants: m.variants,
      kind: m.kind,
      mime: m.mime,
      width: m.width,
      height: m.height,
      focalX: m.focalX,
      focalY: m.focalY,
      dominantColor: m.dominantColor,
    };
  }

  const contentType = allContentTypes.find((c) => c.id === article.contentTypeId) ?? {
    id: article.contentTypeId,
    key: 'article',
    name: 'Artikkel',
    description: null,
    icon: null,
    fields: [],
    isActive: true,
    isDefault: false,
  };
  const section = allSections.find((s) => s.id === article.sectionId) ?? null;

  const checklistItems: EditorChecklistItem[] = ctx.settings.checklist.items.map((item) => ({
    id: item.id,
    label: item.label,
    required: item.required,
    vvpRef: item.vvpRef,
    help: item.help,
    checked: Boolean(article.flags?.[`checklist:${item.id}`]),
  }));

  const publishIssues = validateForPublish(
    {
      title: article.title,
      lead: article.lead,
      sectionId: article.sectionId,
      body: article.body,
      featuredMediaId: article.featuredMediaId,
      featuredCredit: article.featuredCredit,
      bylines: relations.bylines,
      isSponsored: article.isSponsored,
      flags: article.flags ?? {},
      scheduledAt: article.status === 'scheduled' ? article.scheduledAt : null,
      customFields: article.customFields,
    },
    ctx.settings,
    mediaMap,
    contentType.fields,
  );

  const edit = canEditArticle(ctx, article) && !article.deletedAt;
  return {
    article,
    contentType,
    contentTypes: allContentTypes,
    section,
    sections: allSections,
    tagIds: relations.tagIds,
    tagOptions,
    bylines: relations.bylines,
    authorOptions,
    related,
    featuredMedia,
    bodyMedia,
    revisions: { count: revisionCount, latest: revisions[0] ?? null },
    notes,
    lock,
    checklist: { enabled: ctx.settings.checklist.enabled, items: checklistItems },
    members,
    createdBy,
    updatedBy,
    assignedTo,
    publicPath,
    slugLocked: Boolean(article.flags?.[SLUG_LOCKED_FLAG]) || Boolean(article.firstPublishedAt),
    publishIssues,
    permissions: {
      edit,
      publish: ctx.can('article:publish'),
      review: ctx.can('article:review'),
      delete: ctx.can('article:delete'),
      editAny: ctx.can('article:edit_any'),
      create: ctx.can('article:create'),
    },
    allowedTransitions: allowedTransitions(article.status),
  };
}
