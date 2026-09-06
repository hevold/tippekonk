import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import {
  articleBylines,
  articleTags,
  articles,
  auditLog,
  redirects,
  sections,
  tags,
  type MemberRole,
  type User,
} from '@/db/schema';
import { can, type Permission } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import { ActionError, ForbiddenError } from '@/server/actions';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
  requirePermission: async () => {
    throw new Error('requirePermission is not available in service tests');
  },
}));

import {
  buildSectionTree,
  flattenSectionTree,
  listAuthorsWithCounts,
  listSectionTree,
  listTagsWithCounts,
} from './queries';
import {
  createAuthor,
  createSection,
  createTag,
  deleteAuthor,
  deleteSection,
  deleteTag,
  mergeTags,
  reorderAuthors,
  reorderSections,
  setAuthorActive,
  updateAuthor,
  updateSection,
  updateTag,
} from './service';

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
const editor = () => ctxFor(seed.editor, 'editor');
const journalist = () => ctxFor(seed.journalist, 'journalist');

async function insertArticle(spec: {
  title: string;
  sectionId?: string | null;
  status?: 'draft' | 'published';
}) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      sectionId: spec.sectionId === undefined ? seed.section.id : spec.sectionId,
      title: spec.title,
      slug: spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      status: spec.status ?? 'draft',
      publishedAt: spec.status === 'published' ? new Date() : null,
      createdBy: seed.journalist.id,
    })
    .returning();
  return row!;
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('sections', () => {
  it('requires taxonomy:manage', async () => {
    await expect(createSection(journalist(), { name: 'Kultur' })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates with a transliterated, unique slug and audits', async () => {
    const a = await createSection(editor(), { name: 'Næringsliv & økonomi' });
    expect(a.slug).toBe('naeringsliv-og-okonomi');
    const b = await createSection(editor(), { name: 'Næringsliv & økonomi' });
    expect(b.slug).toBe('naeringsliv-og-okonomi-2');
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
    const log = await db.select().from(auditLog).where(eq(auditLog.action, 'section.create'));
    expect(log).toHaveLength(2);
    expect(log[0]!.summary).toContain('Næringsliv');
  });

  it('rejects reserved slugs and duplicates', async () => {
    await expect(createSection(editor(), { name: 'Admin', slug: 'admin' })).rejects.toMatchObject({
      name: 'ZodError',
    });
    // A generated slug that would be reserved gets a suffix instead of failing.
    const tips = await createSection(editor(), { name: 'Tips' });
    expect(tips.slug).toBe('tips-seksjon');
    await expect(createSection(editor(), { name: 'Sport 2', slug: 'sport' })).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { slug: ['Adressen er allerede i bruk'] },
    });
  });

  it('prevents cycles when moving a section under its own child', async () => {
    const parent = await createSection(editor(), { name: 'Meninger' });
    const child = await createSection(editor(), { name: 'Debatt', parentId: parent.id });
    await expect(
      updateSection(editor(), parent.id, { name: 'Meninger', parentId: child.id }),
    ).rejects.toBeInstanceOf(ActionError);
    await expect(
      updateSection(editor(), parent.id, { name: 'Meninger', parentId: parent.id }),
    ).rejects.toBeInstanceOf(ActionError);
    const tree = await listSectionTree(seed.site.id);
    const meninger = tree.find((s) => s.id === parent.id)!;
    expect(meninger.children.map((c) => c.id)).toEqual([child.id]);
    expect(meninger.children[0]!.depth).toBe(1);
  });

  it('records redirects when the slug of a section with published articles changes', async () => {
    await insertArticle({ title: 'Publisert sak', status: 'published' });
    await insertArticle({ title: 'Utkast', status: 'draft' });
    const updated = await updateSection(editor(), seed.section.id, { name: 'Nyheter', slug: 'siste-nytt' });
    expect(updated.slug).toBe('siste-nytt');
    const rows = await db.select().from(redirects).where(eq(redirects.siteId, seed.site.id));
    expect(rows.map((r) => `${r.fromPath} → ${r.toPath}`).sort()).toEqual([
      '/nyheter → /siste-nytt',
      '/nyheter/publisert-sak → /siste-nytt/publisert-sak',
    ]);
  });

  it('refuses to delete a section with articles unless they are reassigned', async () => {
    const a = await insertArticle({ title: 'En sak' });
    await expect(deleteSection(editor(), seed.section.id)).rejects.toMatchObject({ code: 'conflict' });
    await deleteSection(editor(), seed.section.id, { reassignTo: seed.sections.sport.id });
    const [moved] = await db.select().from(articles).where(eq(articles.id, a.id));
    expect(moved!.sectionId).toBe(seed.sections.sport.id);
    const gone = await db.select().from(sections).where(eq(sections.id, seed.section.id));
    expect(gone).toHaveLength(0);
  });

  it('deleting a section lifts its children up and counts articles', async () => {
    const child = await createSection(editor(), { name: 'Lokalt', parentId: seed.section.id });
    await insertArticle({ title: 'Lokal sak', sectionId: child.id });
    await deleteSection(editor(), seed.section.id, { reassignTo: null });
    const [lifted] = await db.select().from(sections).where(eq(sections.id, child.id));
    expect(lifted!.parentId).toBeNull();
    const tree = await listSectionTree(seed.site.id);
    expect(tree.find((s) => s.id === child.id)!.articleCount).toBe(1);
  });

  it('reorders siblings', async () => {
    await reorderSections(editor(), [seed.sections.sport.id, seed.section.id]);
    const tree = await listSectionTree(seed.site.id);
    expect(tree.map((s) => s.slug)).toEqual(['sport', 'nyheter']);
  });

  it('buildSectionTree/flattenSectionTree are pure and orphan-safe', () => {
    const tree = buildSectionTree([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'zzz' },
    ]);
    expect(tree.map((n) => n.id)).toEqual(['a', 'c']);
    expect(flattenSectionTree(tree).map((n) => `${n.id}:${n.depth}`)).toEqual(['a:0', 'b:1', 'c:0']);
  });
});

describe('tags', () => {
  it('creates, updates and lists with counts', async () => {
    const tag = await createTag(editor(), { name: 'Kommunevalg 2027' });
    expect(tag.slug).toBe('kommunevalg-2027');
    const a = await insertArticle({ title: 'Valgsak' });
    await db.insert(articleTags).values({ articleId: a.id, tagId: tag.id });
    const renamed = await updateTag(editor(), tag.id, { name: 'Valg 2027', slug: '' });
    expect(renamed.slug).toBe('kommunevalg-2027');
    const list = await listTagsWithCounts(seed.site.id, { q: 'valg' });
    expect(list.map((t) => [t.name, t.articleCount])).toEqual([['Valg 2027', 1]]);
  });

  it('merges a tag into another and re-points article_tags without duplicates', async () => {
    const [source, target] = seed.tags;
    const a = await insertArticle({ title: 'Sak A' });
    const b = await insertArticle({ title: 'Sak B' });
    await db.insert(articleTags).values([
      { articleId: a.id, tagId: source!.id },
      { articleId: b.id, tagId: source!.id },
      { articleId: b.id, tagId: target!.id },
    ]);
    const result = await mergeTags(editor(), source!.id, target!.id);
    expect(result.moved).toBe(2);
    const remaining = await db.select().from(tags).where(eq(tags.siteId, seed.site.id));
    expect(remaining.map((t) => t.id)).toEqual([target!.id]);
    const links = await db.select().from(articleTags).where(eq(articleTags.tagId, target!.id));
    expect(links.map((l) => l.articleId).sort()).toEqual([a.id, b.id].sort());
    await expect(mergeTags(editor(), target!.id, target!.id)).rejects.toMatchObject({ code: 'validation' });
    const log = await db.select().from(auditLog).where(eq(auditLog.action, 'tag.merge'));
    expect(log).toHaveLength(1);
  });

  it('deletes a tag (cascade removes the links)', async () => {
    const a = await insertArticle({ title: 'Sak' });
    await db.insert(articleTags).values({ articleId: a.id, tagId: seed.tags[0]!.id });
    await deleteTag(editor(), seed.tags[0]!.id);
    const links = await db.select().from(articleTags).where(eq(articleTags.articleId, a.id));
    expect(links).toHaveLength(0);
  });
});

describe('authors', () => {
  it('creates an author linked to a member and validates the link', async () => {
    const author = await createAuthor(editor(), {
      name: 'Kari Nordmann',
      title: 'Fotograf',
      userId: seed.journalist.id,
      email: 'kari@test.local',
    });
    expect(author.slug).toBe('kari-nordmann');
    expect(author.userId).toBe(seed.journalist.id);
    await expect(
      createAuthor(editor(), { name: 'Ukjent', userId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('updates, toggles active and lists with counts', async () => {
    const a = await insertArticle({ title: 'Sak' });
    await db.insert(articleBylines).values({ articleId: a.id, authorId: seed.authors.journalist.id });
    await updateAuthor(editor(), seed.authors.journalist.id, {
      name: 'Julie J.',
      title: 'Reporter',
      slug: 'julie',
      userId: seed.journalist.id,
    });
    await setAuthorActive(editor(), seed.authors.contributor.id, false);
    const list = await listAuthorsWithCounts(seed.site.id);
    const julie = list.find((x) => x.id === seed.authors.journalist.id)!;
    expect(julie.name).toBe('Julie J.');
    expect(julie.slug).toBe('julie');
    expect(julie.articleCount).toBe(1);
    expect(julie.userName).toBe(seed.journalist.name);
    expect(list.find((x) => x.id === seed.authors.contributor.id)!.isActive).toBe(false);
  });

  it('refuses to delete an author with bylines', async () => {
    const a = await insertArticle({ title: 'Sak' });
    await db.insert(articleBylines).values({ articleId: a.id, authorId: seed.authors.editor.id });
    await expect(deleteAuthor(editor(), seed.authors.editor.id)).rejects.toMatchObject({ code: 'conflict' });
    await deleteAuthor(editor(), seed.authors.contributor.id);
    const remaining = await listAuthorsWithCounts(seed.site.id);
    expect(remaining.map((x) => x.id)).not.toContain(seed.authors.contributor.id);
  });

  it('reorders authors', async () => {
    const ids = [
      seed.authors.contributor.id,
      seed.authors.admin.id,
      seed.authors.editor.id,
      seed.authors.journalist.id,
    ];
    await reorderAuthors(editor(), ids);
    const list = await listAuthorsWithCounts(seed.site.id);
    expect(list.map((x) => x.id)).toEqual(ids);
    const [first] = await db
      .select()
      .from(articles)
      .where(and(eq(articles.siteId, seed.site.id), eq(articles.title, 'nope')));
    expect(first).toBeUndefined();
  });
});
