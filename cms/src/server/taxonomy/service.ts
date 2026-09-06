/**
 * Taxonomy mutations: sections, tags and authors. Each function takes the
 * AdminContext, enforces `taxonomy:manage`, validates, writes (in a
 * transaction when several rows change), audits and revalidates the public
 * site. Server actions in ./actions.ts are thin wrappers around these.
 *
 * Slugs: generated from the name with Norwegian transliteration when left
 * blank, made unique per site with a numeric suffix. Section slugs are public
 * URL segments, so reserved words (/admin, /sok, …) are rejected there.
 */
import 'server-only';

import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';

import { db, type Tx } from '@/db';
import {
  articleBylines,
  articleTags,
  articles,
  authors,
  layouts,
  memberships,
  redirects,
  sections,
  tags,
  type Author,
  type Section,
  type Tag,
} from '@/db/schema';
import { isReservedSlug } from '@/config/routes';
import { slugify, uniqueSlug } from '@/lib/text/slug';
import {
  authorInputSchema,
  sectionInputSchema,
  tagInputSchema,
  type AuthorInput,
  type SectionInput,
  type TagInput,
} from '@/lib/validation/taxonomy';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

type Writer = Tx | typeof db;

/* -------------------------------------------------------------------------- */
/*  Slug helpers                                                               */
/* -------------------------------------------------------------------------- */

type SlugTable = typeof sections | typeof tags | typeof authors;

async function slugTaken(tx: Writer, table: SlugTable, siteId: string, slug: string, excludeId?: string): Promise<boolean> {
  const where = excludeId
    ? and(eq(table.siteId, siteId), eq(table.slug, slug), ne(table.id, excludeId))
    : and(eq(table.siteId, siteId), eq(table.slug, slug));
  const [row] = await tx.select({ id: table.id }).from(table).where(where).limit(1);
  return Boolean(row);
}

/**
 * Resolve the slug for a row: an explicit slug must be free (otherwise a
 * field error), a blank one is generated from the name and made unique.
 */
async function resolveSlug(
  tx: Writer,
  table: SlugTable,
  opts: { siteId: string; requested: string; name: string; excludeId?: string; fallback: string; reserved?: boolean },
): Promise<string> {
  if (opts.requested) {
    if (opts.reserved && isReservedSlug(opts.requested)) {
      throw new ActionError('Denne adressen er reservert.', 'validation', { slug: ['Denne adressen er reservert'] });
    }
    if (await slugTaken(tx, table, opts.siteId, opts.requested, opts.excludeId)) {
      throw new ActionError('Adressen er allerede i bruk.', 'validation', { slug: ['Adressen er allerede i bruk'] });
    }
    return opts.requested;
  }
  const base = slugify(opts.name) || opts.fallback;
  const root = opts.reserved && isReservedSlug(base) ? `${base}-${opts.fallback}` : base;
  return uniqueSlug(root, (candidate) => slugTaken(tx, table, opts.siteId, candidate, opts.excludeId));
}

/* -------------------------------------------------------------------------- */
/*  Sections                                                                   */
/* -------------------------------------------------------------------------- */

async function loadSection(tx: Writer, siteId: string, id: string): Promise<Section> {
  const [row] = await tx
    .select()
    .from(sections)
    .where(and(eq(sections.siteId, siteId), eq(sections.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke seksjonen.');
  return row;
}

/** A section may not become its own descendant. */
async function assertValidParent(tx: Writer, siteId: string, id: string | null, parentId: string | null): Promise<void> {
  if (!parentId) return;
  if (id && parentId === id) {
    throw new ActionError('En seksjon kan ikke ligge under seg selv.', 'validation', { parentId: ['Ugyldig overordnet seksjon'] });
  }
  const rows = await tx.select({ id: sections.id, parentId: sections.parentId }).from(sections).where(eq(sections.siteId, siteId));
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  if (!parentOf.has(parentId)) {
    throw new ActionError('Overordnet seksjon finnes ikke.', 'validation', { parentId: ['Ugyldig overordnet seksjon'] });
  }
  if (!id) return;
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === id) {
      throw new ActionError('En seksjon kan ikke flyttes under en av sine egne underseksjoner.', 'validation', {
        parentId: ['Ugyldig overordnet seksjon'],
      });
    }
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
}

async function nextSortOrder(tx: Writer, siteId: string, parentId: string | null): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`coalesce(max(${sections.sortOrder}), -1)`.mapWith(Number) })
    .from(sections)
    .where(and(eq(sections.siteId, siteId), parentId ? eq(sections.parentId, parentId) : isNull(sections.parentId)));
  return (row?.max ?? -1) + 1;
}

export async function createSection(ctx: AdminContext, input: unknown): Promise<Section> {
  assertCan(ctx, 'taxonomy:manage');
  const data: SectionInput = sectionInputSchema.parse(input);
  const section = await db.transaction(async (tx) => {
    await assertValidParent(tx, ctx.site.id, null, data.parentId);
    const slug = await resolveSlug(tx, sections, {
      siteId: ctx.site.id,
      requested: data.slug,
      name: data.name,
      fallback: 'seksjon',
      reserved: true,
    });
    const sortOrder = input && typeof input === 'object' && 'sortOrder' in input ? data.sortOrder : await nextSortOrder(tx, ctx.site.id, data.parentId);
    const [row] = await tx
      .insert(sections)
      .values({
        siteId: ctx.site.id,
        parentId: data.parentId,
        name: data.name,
        slug,
        description: data.description,
        color: data.color,
        sortOrder,
        showInMenu: data.showInMenu,
        isActive: data.isActive,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
      })
      .returning();
    if (!row) throw new Error('Kunne ikke opprette seksjonen.');
    return row;
  });
  await auditFromContext(ctx, {
    action: 'section.create',
    entityType: 'section',
    entityId: section.id,
    summary: `Opprettet seksjonen «${section.name}»`,
    data: { slug: section.slug },
  });
  revalidatePublic(ctx.site.id);
  return section;
}

/**
 * Update a section. When the slug of a section with published articles
 * changes, redirects from the old paths are recorded so links keep working
 * (SPEC 5.3).
 */
export async function updateSection(ctx: AdminContext, id: string, input: unknown): Promise<Section> {
  assertCan(ctx, 'taxonomy:manage');
  const data: SectionInput = sectionInputSchema.parse(input);
  const result = await db.transaction(async (tx) => {
    const existing = await loadSection(tx, ctx.site.id, id);
    await assertValidParent(tx, ctx.site.id, id, data.parentId);
    const slug = await resolveSlug(tx, sections, {
      siteId: ctx.site.id,
      requested: data.slug || existing.slug,
      name: data.name,
      excludeId: id,
      fallback: 'seksjon',
      reserved: true,
    });
    const [row] = await tx
      .update(sections)
      .set({
        parentId: data.parentId,
        name: data.name,
        slug,
        description: data.description,
        color: data.color,
        sortOrder: data.sortOrder,
        showInMenu: data.showInMenu,
        isActive: data.isActive,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        updatedAt: new Date(),
      })
      .where(eq(sections.id, id))
      .returning();
    if (!row) throw new NotFoundError('Fant ikke seksjonen.');

    if (slug !== existing.slug) {
      const published = await tx
        .select({ slug: articles.slug })
        .from(articles)
        .where(and(eq(articles.sectionId, id), eq(articles.status, 'published'), isNull(articles.deletedAt)));
      const rows = [
        { fromPath: `/${existing.slug}`, toPath: `/${slug}` },
        ...published.map((a) => ({ fromPath: `/${existing.slug}/${a.slug}`, toPath: `/${slug}/${a.slug}` })),
      ];
      for (const r of rows) {
        await tx
          .insert(redirects)
          .values({ siteId: ctx.site.id, fromPath: r.fromPath, toPath: r.toPath })
          .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath: r.toPath } });
      }
    }
    return { row, previous: existing };
  });
  await auditFromContext(ctx, {
    action: 'section.update',
    entityType: 'section',
    entityId: id,
    summary: `Oppdaterte seksjonen «${result.row.name}»`,
    data: { slug: result.row.slug, previousSlug: result.previous.slug },
  });
  revalidatePublic(ctx.site.id);
  return result.row;
}

export type DeleteSectionOptions = {
  /** Move the section's articles here (null = no section). Required when articles exist. */
  reassignTo?: string | null;
};

/**
 * Delete a section. Refuses when articles still point at it unless
 * `reassignTo` says where they go. Child sections move up to the deleted
 * section's parent.
 */
export async function deleteSection(ctx: AdminContext, id: string, opts: DeleteSectionOptions = {}): Promise<void> {
  assertCan(ctx, 'taxonomy:manage');
  const name = await db.transaction(async (tx) => {
    const existing = await loadSection(tx, ctx.site.id, id);
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(articles)
      .where(and(eq(articles.sectionId, id), isNull(articles.deletedAt)));
    const articleCount = countRow?.value ?? 0;
    if (articleCount > 0 && opts.reassignTo === undefined) {
      throw new ActionError(
        `Seksjonen har ${articleCount} saker. Velg hvor de skal flyttes før du sletter.`,
        'conflict',
      );
    }
    if (opts.reassignTo) {
      if (opts.reassignTo === id) throw new ActionError('Kan ikke flytte sakene til seksjonen som slettes.', 'validation');
      await loadSection(tx, ctx.site.id, opts.reassignTo);
    }
    if (opts.reassignTo !== undefined) {
      await tx
        .update(articles)
        .set({ sectionId: opts.reassignTo, updatedAt: new Date() })
        .where(eq(articles.sectionId, id));
    }
    await tx.update(sections).set({ parentId: existing.parentId }).where(eq(sections.parentId, id));
    await tx.delete(layouts).where(and(eq(layouts.siteId, ctx.site.id), eq(layouts.key, `section:${id}`)));
    await tx.delete(sections).where(eq(sections.id, id));
    return existing.name;
  });
  await auditFromContext(ctx, {
    action: 'section.delete',
    entityType: 'section',
    entityId: id,
    summary: `Slettet seksjonen «${name}»`,
    data: { reassignTo: opts.reassignTo ?? null },
  });
  revalidatePublic(ctx.site.id);
}

/** Store a new order for the given siblings (ids in display order). */
export async function reorderSections(ctx: AdminContext, ids: string[]): Promise<void> {
  assertCan(ctx, 'taxonomy:manage');
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: sections.id })
      .from(sections)
      .where(and(eq(sections.siteId, ctx.site.id), inArray(sections.id, ids)));
    const known = new Set(rows.map((r) => r.id));
    let index = 0;
    for (const id of ids) {
      if (!known.has(id)) continue;
      await tx.update(sections).set({ sortOrder: index, updatedAt: new Date() }).where(eq(sections.id, id));
      index += 1;
    }
  });
  await auditFromContext(ctx, { action: 'section.reorder', entityType: 'section', summary: 'Endret rekkefølgen på seksjoner' });
  revalidatePublic(ctx.site.id);
}

/* -------------------------------------------------------------------------- */
/*  Tags                                                                       */
/* -------------------------------------------------------------------------- */

async function loadTag(tx: Writer, siteId: string, id: string): Promise<Tag> {
  const [row] = await tx
    .select()
    .from(tags)
    .where(and(eq(tags.siteId, siteId), eq(tags.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke stikkordet.');
  return row;
}

export async function createTag(ctx: AdminContext, input: unknown): Promise<Tag> {
  assertCan(ctx, 'taxonomy:manage');
  const data: TagInput = tagInputSchema.parse(input);
  const tag = await db.transaction(async (tx) => {
    const slug = await resolveSlug(tx, tags, { siteId: ctx.site.id, requested: data.slug, name: data.name, fallback: 'stikkord' });
    const [row] = await tx
      .insert(tags)
      .values({ siteId: ctx.site.id, name: data.name, slug, description: data.description })
      .returning();
    if (!row) throw new Error('Kunne ikke opprette stikkordet.');
    return row;
  });
  await auditFromContext(ctx, {
    action: 'tag.create',
    entityType: 'tag',
    entityId: tag.id,
    summary: `Opprettet stikkordet «${tag.name}»`,
  });
  revalidatePublic(ctx.site.id);
  return tag;
}

export async function updateTag(ctx: AdminContext, id: string, input: unknown): Promise<Tag> {
  assertCan(ctx, 'taxonomy:manage');
  const data: TagInput = tagInputSchema.parse(input);
  const tag = await db.transaction(async (tx) => {
    const existing = await loadTag(tx, ctx.site.id, id);
    const slug = await resolveSlug(tx, tags, {
      siteId: ctx.site.id,
      requested: data.slug || existing.slug,
      name: data.name,
      excludeId: id,
      fallback: 'stikkord',
    });
    const [row] = await tx
      .update(tags)
      .set({ name: data.name, slug, description: data.description })
      .where(eq(tags.id, id))
      .returning();
    if (!row) throw new NotFoundError('Fant ikke stikkordet.');
    return row;
  });
  await auditFromContext(ctx, {
    action: 'tag.update',
    entityType: 'tag',
    entityId: id,
    summary: `Oppdaterte stikkordet «${tag.name}»`,
  });
  revalidatePublic(ctx.site.id);
  return tag;
}

export async function deleteTag(ctx: AdminContext, id: string): Promise<void> {
  assertCan(ctx, 'taxonomy:manage');
  const existing = await loadTag(db, ctx.site.id, id);
  await db.delete(tags).where(eq(tags.id, id));
  await auditFromContext(ctx, {
    action: 'tag.delete',
    entityType: 'tag',
    entityId: id,
    summary: `Slettet stikkordet «${existing.name}»`,
  });
  revalidatePublic(ctx.site.id);
}

/**
 * Merge `sourceId` into `targetId`: every article tagged with the source is
 * tagged with the target instead (duplicates collapse), then the source is
 * deleted. Returns the target and how many articles were moved.
 */
export async function mergeTags(
  ctx: AdminContext,
  sourceId: string,
  targetId: string,
): Promise<{ target: Tag; moved: number }> {
  assertCan(ctx, 'taxonomy:manage');
  if (sourceId === targetId) throw new ActionError('Velg to forskjellige stikkord.', 'validation', { targetId: ['Velg et annet stikkord'] });
  const result = await db.transaction(async (tx) => {
    const source = await loadTag(tx, ctx.site.id, sourceId);
    const target = await loadTag(tx, ctx.site.id, targetId);
    const rows = await tx.select({ articleId: articleTags.articleId }).from(articleTags).where(eq(articleTags.tagId, sourceId));
    if (rows.length > 0) {
      await tx
        .insert(articleTags)
        .values(rows.map((r) => ({ articleId: r.articleId, tagId: targetId })))
        .onConflictDoNothing();
    }
    await tx.delete(tags).where(eq(tags.id, sourceId));
    return { source, target, moved: rows.length };
  });
  await auditFromContext(ctx, {
    action: 'tag.merge',
    entityType: 'tag',
    entityId: targetId,
    summary: `Slo sammen «${result.source.name}» med «${result.target.name}» (${result.moved} saker)`,
    data: { sourceId, sourceName: result.source.name, moved: result.moved },
  });
  revalidatePublic(ctx.site.id);
  return { target: result.target, moved: result.moved };
}

/* -------------------------------------------------------------------------- */
/*  Authors                                                                    */
/* -------------------------------------------------------------------------- */

async function loadAuthor(tx: Writer, siteId: string, id: string): Promise<Author> {
  const [row] = await tx
    .select()
    .from(authors)
    .where(and(eq(authors.siteId, siteId), eq(authors.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke skribenten.');
  return row;
}

async function assertMember(tx: Writer, siteId: string, userId: string | null): Promise<void> {
  if (!userId) return;
  const [m] = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.siteId, siteId), eq(memberships.userId, userId)))
    .limit(1);
  if (!m) throw new ActionError('Brukeren er ikke medlem av redaksjonen.', 'validation', { userId: ['Ugyldig bruker'] });
}

function authorValues(data: AuthorInput) {
  return {
    name: data.name,
    userId: data.userId,
    title: data.title,
    bio: data.bio,
    email: data.email,
    phone: data.phone,
    imageMediaId: data.imageMediaId,
    isActive: data.isActive,
  };
}

export async function createAuthor(ctx: AdminContext, input: unknown): Promise<Author> {
  assertCan(ctx, 'taxonomy:manage');
  const data: AuthorInput = authorInputSchema.parse(input);
  const author = await db.transaction(async (tx) => {
    await assertMember(tx, ctx.site.id, data.userId);
    const slug = await resolveSlug(tx, authors, { siteId: ctx.site.id, requested: data.slug, name: data.name, fallback: 'skribent' });
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${authors.sortOrder}), -1)`.mapWith(Number) })
      .from(authors)
      .where(eq(authors.siteId, ctx.site.id));
    const sortOrder = input && typeof input === 'object' && 'sortOrder' in input ? data.sortOrder : (maxRow?.max ?? -1) + 1;
    const [row] = await tx
      .insert(authors)
      .values({ siteId: ctx.site.id, slug, sortOrder, ...authorValues(data) })
      .returning();
    if (!row) throw new Error('Kunne ikke opprette skribenten.');
    return row;
  });
  await auditFromContext(ctx, {
    action: 'author.create',
    entityType: 'author',
    entityId: author.id,
    summary: `Opprettet skribenten «${author.name}»`,
  });
  revalidatePublic(ctx.site.id);
  return author;
}

export async function updateAuthor(ctx: AdminContext, id: string, input: unknown): Promise<Author> {
  assertCan(ctx, 'taxonomy:manage');
  const data: AuthorInput = authorInputSchema.parse(input);
  const author = await db.transaction(async (tx) => {
    const existing = await loadAuthor(tx, ctx.site.id, id);
    await assertMember(tx, ctx.site.id, data.userId);
    const slug = await resolveSlug(tx, authors, {
      siteId: ctx.site.id,
      requested: data.slug || existing.slug,
      name: data.name,
      excludeId: id,
      fallback: 'skribent',
    });
    const [row] = await tx
      .update(authors)
      .set({ slug, sortOrder: data.sortOrder, ...authorValues(data), updatedAt: new Date() })
      .where(eq(authors.id, id))
      .returning();
    if (!row) throw new NotFoundError('Fant ikke skribenten.');
    return row;
  });
  await auditFromContext(ctx, {
    action: 'author.update',
    entityType: 'author',
    entityId: id,
    summary: `Oppdaterte skribenten «${author.name}»`,
  });
  revalidatePublic(ctx.site.id);
  return author;
}

/** Flip isActive without touching the rest of the profile. */
export async function setAuthorActive(ctx: AdminContext, id: string, isActive: boolean): Promise<Author> {
  assertCan(ctx, 'taxonomy:manage');
  await loadAuthor(db, ctx.site.id, id);
  const [row] = await db
    .update(authors)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(authors.id, id))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke skribenten.');
  await auditFromContext(ctx, {
    action: 'author.update',
    entityType: 'author',
    entityId: id,
    summary: `${isActive ? 'Aktiverte' : 'Deaktiverte'} skribenten «${row.name}»`,
  });
  revalidatePublic(ctx.site.id);
  return row;
}

/** Delete an author. Refuses while bylines reference it — deactivate instead. */
export async function deleteAuthor(ctx: AdminContext, id: string): Promise<void> {
  assertCan(ctx, 'taxonomy:manage');
  const name = await db.transaction(async (tx) => {
    const existing = await loadAuthor(tx, ctx.site.id, id);
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(articleBylines)
      .innerJoin(articles, eq(articles.id, articleBylines.articleId))
      .where(and(eq(articleBylines.authorId, id), isNull(articles.deletedAt)));
    const used = countRow?.value ?? 0;
    if (used > 0) {
      throw new ActionError(
        `Skribenten står som byline på ${used} saker og kan ikke slettes. Deaktiver skribenten i stedet.`,
        'conflict',
      );
    }
    await tx.delete(authors).where(eq(authors.id, id));
    return existing.name;
  });
  await auditFromContext(ctx, {
    action: 'author.delete',
    entityType: 'author',
    entityId: id,
    summary: `Slettet skribenten «${name}»`,
  });
  revalidatePublic(ctx.site.id);
}

export async function reorderAuthors(ctx: AdminContext, ids: string[]): Promise<void> {
  assertCan(ctx, 'taxonomy:manage');
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: authors.id })
      .from(authors)
      .where(and(eq(authors.siteId, ctx.site.id), inArray(authors.id, ids)))
      .orderBy(asc(authors.sortOrder));
    const known = new Set(rows.map((r) => r.id));
    let index = 0;
    for (const id of ids) {
      if (!known.has(id)) continue;
      await tx.update(authors).set({ sortOrder: index, updatedAt: new Date() }).where(eq(authors.id, id));
      index += 1;
    }
  });
  await auditFromContext(ctx, { action: 'author.reorder', entityType: 'author', summary: 'Endret rekkefølgen på skribenter' });
  revalidatePublic(ctx.site.id);
}
