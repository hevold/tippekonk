import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articleBylines, articleTags, articles, type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  countArticlesByTab,
  listArticleFilterOptions,
  listArticles,
  orderSectionTree,
  parseArticleListFilter,
  tabFor,
} from './list';

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

type Spec = {
  title: string;
  status?: (typeof articles.$inferInsert)['status'];
  createdBy?: string;
  assignedTo?: string | null;
  sectionId?: string | null;
  publishedAt?: Date | null;
  updatedAt?: Date;
  deletedAt?: Date | null;
  bodyText?: string;
  contentTypeId?: string;
  deadlineAt?: Date | null;
};

async function insertArticle(spec: Spec) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: spec.contentTypeId ?? seed.contentType.id,
      sectionId: spec.sectionId === undefined ? seed.section.id : spec.sectionId,
      title: spec.title,
      slug:
        spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 7),
      bodyText: spec.bodyText ?? '',
      status: spec.status ?? 'draft',
      createdBy: spec.createdBy ?? seed.journalist.id,
      updatedBy: spec.createdBy ?? seed.journalist.id,
      assignedTo: spec.assignedTo === undefined ? null : spec.assignedTo,
      publishedAt: spec.publishedAt ?? null,
      updatedAt: spec.updatedAt ?? new Date(),
      deletedAt: spec.deletedAt ?? null,
      deadlineAt: spec.deadlineAt ?? null,
      wordCount: 120,
    })
    .returning();
  if (!row) throw new Error('insert failed');
  return row;
}

const filter = (overrides: Record<string, string | undefined> = {}) => parseArticleListFilter(overrides);

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseArticleListFilter', () => {
  it('applies defaults and drops invalid values without failing', () => {
    const f = parseArticleListFilter({ status: 'bogus', sectionId: 'not-a-uuid', page: '3', q: 'kommune' });
    expect(f.status).toBeUndefined();
    expect(f.sectionId).toBeUndefined();
    expect(f.page).toBe(3);
    expect(f.q).toBe('kommune');
    expect(f.perPage).toBe(25);
    expect(f.sort).toBe('-updatedAt');
  });

  it('accepts the trash and mine tabs plus a date range', () => {
    expect(tabFor(parseArticleListFilter({ status: 'trash' }).status)).toBe('trash');
    expect(tabFor(parseArticleListFilter({ status: 'mine' }).status)).toBe('mine');
    expect(tabFor(undefined)).toBe('all');
    const f = parseArticleListFilter({ from: '2026-01-01', to: '2026-02-01T00:00:00Z' });
    expect(f.from).toBeInstanceOf(Date);
    expect(f.to).toBeInstanceOf(Date);
  });
});

describe('listArticles', () => {
  it('filters by status tab and counts every tab', async () => {
    await insertArticle({ title: 'Utkast en' });
    await insertArticle({ title: 'Utkast to' });
    await insertArticle({ title: 'Til desk', status: 'in_review' });
    await insertArticle({ title: 'Publisert', status: 'published', publishedAt: new Date() });
    await insertArticle({ title: 'Slettet', deletedAt: new Date() });

    const ctx = ctxFor(seed.editor, 'editor');
    const all = await listArticles(ctx, filter());
    expect(all.total).toBe(4);
    expect(all.items.map((a) => a.title)).not.toContain('Slettet');

    const drafts = await listArticles(ctx, filter({ status: 'draft' }));
    expect(drafts.items.map((a) => a.title).sort()).toEqual(['Utkast en', 'Utkast to']);

    const trash = await listArticles(ctx, filter({ status: 'trash' }));
    expect(trash.items.map((a) => a.title)).toEqual(['Slettet']);

    const counts = await countArticlesByTab(ctx, filter());
    expect(counts).toMatchObject({ all: 4, draft: 2, in_review: 1, published: 1, trash: 1, archived: 0 });
  });

  it('"mine" shows articles created by or assigned to the user', async () => {
    await insertArticle({ title: 'Min egen', createdBy: seed.editor.id });
    await insertArticle({ title: 'Tildelt meg', createdBy: seed.journalist.id, assignedTo: seed.editor.id });
    await insertArticle({ title: 'Andres', createdBy: seed.journalist.id, assignedTo: seed.journalist.id });

    const ctx = ctxFor(seed.editor, 'editor');
    const mine = await listArticles(ctx, filter({ status: 'mine' }));
    expect(mine.items.map((a) => a.title).sort()).toEqual(['Min egen', 'Tildelt meg']);
    const counts = await countArticlesByTab(ctx, filter());
    expect(counts.mine).toBe(2);
    expect(counts.all).toBe(3);
  });

  it('scopes contributors to their own articles server-side', async () => {
    await insertArticle({ title: 'Frilansens sak', createdBy: seed.contributor.id });
    await insertArticle({
      title: 'Redaksjonens sak',
      createdBy: seed.journalist.id,
      assignedTo: seed.contributor.id,
    });

    const ctx = ctxFor(seed.contributor, 'contributor');
    const page = await listArticles(ctx, filter());
    expect(page.items.map((a) => a.title)).toEqual(['Frilansens sak']);
    const counts = await countArticlesByTab(ctx, filter());
    expect(counts.all).toBe(1);
    // Even the "mine" tab cannot widen the scope to an assigned article created by someone else.
    const mine = await listArticles(ctx, filter({ status: 'mine' }));
    expect(mine.items.map((a) => a.title)).toEqual(['Frilansens sak']);
  });

  it('searches with Norwegian full text and falls back to title ILIKE', async () => {
    await insertArticle({ title: 'Kommunestyret vedtok budsjettet', bodyText: 'Rådmannen la fram tallene.' });
    await insertArticle({ title: 'Fotballkampen endte uavgjort', bodyText: 'Elvebyen spilte 2–2.' });
    await insertArticle({ title: 'Ny rådmann ansatt', bodyText: '' });

    const ctx = ctxFor(seed.editor, 'editor');
    // Stemming: "budsjett" matches "budsjettet".
    const byStem = await listArticles(ctx, filter({ q: 'budsjett' }));
    expect(byStem.items.map((a) => a.title)).toEqual(['Kommunestyret vedtok budsjettet']);
    // Body text is searchable too.
    const byBody = await listArticles(ctx, filter({ q: 'rådmannen' }));
    expect(byBody.items.map((a) => a.title)).toContain('Kommunestyret vedtok budsjettet');
    // Partial word → ILIKE fallback.
    const partial = await listArticles(ctx, filter({ q: 'fotballk' }));
    expect(partial.items.map((a) => a.title)).toEqual(['Fotballkampen endte uavgjort']);
    // Wildcards are literal.
    const wild = await listArticles(ctx, filter({ q: '%' }));
    expect(wild.total).toBe(0);
  });

  it('filters by section (including child sections), content type, byline and assignee', async () => {
    const parent = seed.sections.nyheter;
    const [child] = await db
      .insert((await import('@/db/schema')).sections)
      .values({ siteId: seed.site.id, name: 'Lokalt', slug: 'lokalt', parentId: parent.id })
      .returning();
    const a = await insertArticle({ title: 'I nyheter', sectionId: parent.id });
    const b = await insertArticle({ title: 'I lokalt', sectionId: child!.id });
    const c = await insertArticle({
      title: 'I sport',
      sectionId: seed.sections.sport.id,
      contentTypeId: seed.contentTypes.notice.id,
      assignedTo: seed.journalist.id,
    });
    await db.insert(articleBylines).values({ articleId: a.id, authorId: seed.authors.journalist.id });
    await db.insert(articleBylines).values({ articleId: b.id, authorId: seed.authors.editor.id });
    await db.insert(articleTags).values({ articleId: c.id, tagId: seed.tags[0]!.id });

    const ctx = ctxFor(seed.editor, 'editor');
    const bySection = await listArticles(ctx, filter({ sectionId: parent.id }));
    expect(bySection.items.map((x) => x.title).sort()).toEqual(['I lokalt', 'I nyheter']);
    const byType = await listArticles(ctx, filter({ contentTypeId: seed.contentTypes.notice.id }));
    expect(byType.items.map((x) => x.title)).toEqual(['I sport']);
    const byAuthor = await listArticles(ctx, filter({ authorId: seed.authors.journalist.id }));
    expect(byAuthor.items.map((x) => x.title)).toEqual(['I nyheter']);
    expect(byAuthor.items[0]!.bylines.map((by) => by.name)).toEqual([seed.journalist.name]);
    const byAssignee = await listArticles(ctx, filter({ assignedTo: seed.journalist.id }));
    expect(byAssignee.items.map((x) => x.title)).toEqual(['I sport']);
    expect(byAssignee.items[0]!.assignedToName).toBe(seed.journalist.name);
    const byTag = await listArticles(ctx, filter({ tagId: seed.tags[0]!.id }));
    expect(byTag.items.map((x) => x.title)).toEqual(['I sport']);
  });

  it('sorts, paginates and clamps the page number', async () => {
    const base = Date.UTC(2026, 0, 1);
    for (let i = 0; i < 30; i++) {
      await insertArticle({
        title: `Sak ${String(i).padStart(2, '0')}`,
        updatedAt: new Date(base + i * 60_000),
      });
    }
    const ctx = ctxFor(seed.editor, 'editor');
    const page1 = await listArticles(ctx, filter());
    expect(page1.total).toBe(30);
    expect(page1.pageCount).toBe(2);
    expect(page1.items).toHaveLength(25);
    expect(page1.items[0]!.title).toBe('Sak 29');

    const page2 = await listArticles(ctx, filter({ page: '2' }));
    expect(page2.items).toHaveLength(5);
    expect(page2.items[4]!.title).toBe('Sak 00');

    const clamped = await listArticles(ctx, filter({ page: '99' }));
    expect(clamped.page).toBe(2);

    const byTitle = await listArticles(ctx, filter({ sort: 'title', perPage: '3' }));
    expect(byTitle.items.map((a) => a.title)).toEqual(['Sak 00', 'Sak 01', 'Sak 02']);
  });

  it('puts articles without a deadline last when sorting by deadline', async () => {
    await insertArticle({ title: 'Uten frist' });
    await insertArticle({ title: 'Frist i morgen', deadlineAt: new Date(Date.now() + 86_400_000) });
    await insertArticle({ title: 'Frist i dag', deadlineAt: new Date(Date.now() + 3_600_000) });
    const ctx = ctxFor(seed.editor, 'editor');
    const asc = await listArticles(ctx, filter({ sort: 'deadlineAt' }));
    expect(asc.items.map((a) => a.title)).toEqual(['Frist i dag', 'Frist i morgen', 'Uten frist']);
    const desc = await listArticles(ctx, filter({ sort: '-deadlineAt' }));
    expect(desc.items.map((a) => a.title)).toEqual(['Frist i morgen', 'Frist i dag', 'Uten frist']);
  });

  it('applies the date range to the publish date on the published tab', async () => {
    await insertArticle({
      title: 'Gammel',
      status: 'published',
      publishedAt: new Date('2026-01-10T10:00:00Z'),
    });
    await insertArticle({ title: 'Ny', status: 'published', publishedAt: new Date('2026-03-10T10:00:00Z') });
    const ctx = ctxFor(seed.editor, 'editor');
    const page = await listArticles(
      ctx,
      filter({ status: 'published', from: '2026-02-01', to: '2026-04-01' }),
    );
    expect(page.items.map((a) => a.title)).toEqual(['Ny']);
  });
});

describe('listArticleFilterOptions', () => {
  it('returns sections as a tree plus types, authors and members', async () => {
    const options = await listArticleFilterOptions(seed.site.id);
    expect(options.sections.map((s) => s.name)).toEqual(['Nyheter', 'Sport']);
    expect(options.contentTypes.map((c) => c.name)).toEqual(['Artikkel', 'Kommentar', 'Notis']);
    expect(options.authors).toHaveLength(4);
    expect(options.members.map((m) => m.name)).toContain(seed.editor.name);
  });

  it('orders a section tree parents-first', () => {
    const rows = [
      { id: 'b', parentId: 'a', name: 'B' },
      { id: 'a', parentId: null, name: 'A' },
      { id: 'c', parentId: null, name: 'C' },
      { id: 'd', parentId: 'missing', name: 'D' },
    ];
    expect(orderSectionTree(rows).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
