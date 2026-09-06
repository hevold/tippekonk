import { beforeAll, describe, expect, it, vi } from 'vitest';

import { layouts, menus, type Section } from '@/db/schema';
import { defaultFrontLayout, resolveLayout } from '@/lib/layout/engine';
import { seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';
import type { Db } from '@/db';

vi.mock('server-only', () => ({}));

import {
  countTeasers,
  getArticleById,
  getArticleByPath,
  getArticleBySlug,
  getArticleForPreview,
  getAuthorBySlug,
  getBreaking,
  getFrontLayout,
  getMenus,
  getRelated,
  getSectionBySlug,
  getSectionLayout,
  getTagBySlug,
  layoutSource,
  listFeedArticles,
  listSections,
  listSitemapArticles,
  listTeasers,
  parseHeadline,
  searchArticles,
} from './queries';
import { addViews, seedNewsroom, type Newsroom } from './test-fixtures';

let db: Db;
let seeded: SeedMinimalResult;
let fx: Newsroom;
let site: string;

function isoDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

beforeAll(async () => {
  db = await useTestDb();
  seeded = await seedMinimal(db);
  site = seeded.site.id;
  fx = await seedNewsroom(db, seeded);
  await addViews(db, fx.ids.fotball, isoDay(0), 500);
  await addViews(db, fx.ids.fotball, isoDay(1), 100);
  await addViews(db, fx.ids.budsjett, isoDay(2), 80);
  await addViews(db, fx.ids.skole, isoDay(10), 9000); // outside a 7-day window
  await db.insert(menus).values([
    { siteId: site, key: 'primary', items: [{ id: 'a', label: 'Nyheter', href: '/nyheter' }] },
    {
      siteId: site,
      key: 'footer',
      items: [{ id: 'b', label: 'Om oss', href: '/om' }, { id: 'bad' } as never],
    },
  ]);
});

describe('published-only filtering', () => {
  it('returns a published article by section + slug with bylines, tags, media and related', async () => {
    const a = await getArticleByPath(site, 'nyheter', 'ny-skole-pa-storasen');
    expect(a).not.toBeNull();
    expect(a!.title).toBe('Ny skole på Storåsen åpner til høsten');
    expect(a!.section?.slug).toBe('nyheter');
    expect(a!.contentType.key).toBe('article');
    expect(a!.featuredMedia?.id).toBe(fx.media.id);
    expect(a!.bylines.map((b) => b.name)).toEqual(['Julie Journalist']);
    expect(a!.tags.map((t) => t.slug)).toEqual(['kommunestyret']);
    expect(a!.publishedAt).toBeInstanceOf(Date);
    expect(a!.isBreaking).toBe(true);
    expect(a!.readingTimeMin).toBeGreaterThanOrEqual(1);
    // related: the draft is filtered out, order kept
    expect(a!.related.map((r) => r.slug)).toEqual(['budsjettet-vedtatt', 'elvebyen-vant-cupkampen']);
  });

  it('hides drafts, future publish dates, trashed and unpublished articles', async () => {
    expect(await getArticleByPath(site, 'nyheter', 'utkast-om-skole')).toBeNull();
    expect(await getArticleByPath(site, 'nyheter', 'fremtidig-sak')).toBeNull();
    expect(await getArticleByPath(site, 'nyheter', 'slettet-sak')).toBeNull();
    expect(await getArticleByPath(site, 'sport', 'avpublisert-sak')).toBeNull();
    expect(await getArticleById(site, fx.ids.utkast)).toBeNull();
  });

  it('requires the right section and site', async () => {
    expect(await getArticleByPath(site, 'sport', 'ny-skole-pa-storasen')).toBeNull();
    expect(
      await getArticleByPath('00000000-0000-0000-0000-000000000000', 'nyheter', 'ny-skole-pa-storasen'),
    ).toBeNull();
    const moved = await getArticleBySlug(site, 'ny-skole-pa-storasen');
    expect(moved?.section?.slug).toBe('nyheter');
  });

  it('getArticleById returns the published article', async () => {
    const a = await getArticleById(site, fx.ids.budsjett);
    expect(a?.access).toBe('plus');
    expect(a?.bylines.map((b) => b.name)).toEqual(['Erik Redaktør', 'Julie Journalist']);
  });

  it('getArticleForPreview returns drafts but never trashed articles', async () => {
    const draft = await getArticleForPreview(site, fx.ids.utkast);
    expect(draft?.status).toBe('draft');
    expect(draft?.createdBy).toBe(seeded.contributor.id);
    expect(await getArticleForPreview(site, fx.ids.slettet)).toBeNull();
  });
});

describe('listTeasers', () => {
  it('lists newest first and only visible articles', async () => {
    const list = await listTeasers(site, { limit: 20 });
    const slugs = list.map((t) => t.slug);
    expect(slugs).toEqual([
      'ny-skole-pa-storasen',
      'slik-sparer-du-til-bolig',
      'kommentar-skolene',
      'elvebyen-vant-cupkampen',
      'budsjettet-vedtatt',
    ]);
    expect(list[0]!.featuredMedia?.id).toBe(fx.media.id);
    expect(list[0]!.bylines[0]).toMatchObject({ name: 'Julie Journalist', slug: 'julie-journalist' });
  });

  it('filters by section (with children), tag, author, content type, access and exclude', async () => {
    const child = await db
      .insert((await import('@/db/schema')).sections)
      .values({
        siteId: site,
        name: 'Lokalfotball',
        slug: 'lokalfotball',
        parentId: seeded.sections.sport.id,
      })
      .returning();
    const childId = (child[0] as Section).id;
    const { insertArticle } = await import('./test-fixtures');
    await insertArticle(db, site, {
      key: 'child',
      title: 'Barnesak i underseksjon',
      slug: 'barnesak',
      sectionId: childId,
      contentTypeId: seeded.contentTypes.article.id,
      status: 'published',
      publishedAt: new Date(Date.now() - 30 * 3_600_000),
    });

    const sport = await listTeasers(site, { sectionId: seeded.sections.sport.id, limit: 10 });
    expect(sport.map((t) => t.slug)).toEqual([
      'slik-sparer-du-til-bolig',
      'elvebyen-vant-cupkampen',
      'barnesak',
    ]);
    expect(await countTeasers(site, { sectionId: seeded.sections.sport.id })).toBe(3);

    const byTag = await listTeasers(site, { tagId: seeded.tags[0]!.id, limit: 10 });
    expect(byTag.map((t) => t.slug)).toEqual(['ny-skole-pa-storasen', 'budsjettet-vedtatt']);

    const byAuthor = await listTeasers(site, { authorId: seeded.authors.journalist.id, limit: 10 });
    expect(byAuthor.map((t) => t.slug)).toEqual(['ny-skole-pa-storasen', 'budsjettet-vedtatt']);

    const opinion = await listTeasers(site, { contentTypeKey: 'opinion', limit: 10 });
    expect(opinion.map((t) => t.slug)).toEqual(['kommentar-skolene']);

    const plus = await listTeasers(site, { access: 'plus', limit: 10 });
    expect(plus.map((t) => t.slug)).toEqual(['budsjettet-vedtatt']);

    const excluded = await listTeasers(site, { limit: 10, exclude: [fx.ids.skole, fx.ids.sponset] });
    expect(excluded.map((t) => t.slug)).not.toContain('ny-skole-pa-storasen');
    expect(excluded.map((t) => t.slug)).not.toContain('slik-sparer-du-til-bolig');

    const paged = await listTeasers(site, { limit: 2, offset: 2 });
    expect(paged.map((t) => t.slug)).toEqual(['kommentar-skolene', 'elvebyen-vant-cupkampen']);
  });

  it('orders by article_views within the window for most-read', async () => {
    const most = await listTeasers(site, { limit: 3, order: 'most-read', days: 7 });
    expect(most.map((t) => t.slug).slice(0, 2)).toEqual(['elvebyen-vant-cupkampen', 'budsjettet-vedtatt']);
    const wide = await listTeasers(site, { limit: 1, order: 'most-read', days: 30 });
    expect(wide[0]!.slug).toBe('ny-skole-pa-storasen');
  });

  it('returns nothing for a zero limit', async () => {
    expect(await listTeasers(site, { limit: 0 })).toEqual([]);
  });
});

describe('searchArticles', () => {
  it('stems Norwegian: "skolene" finds "skole" and highlights the hit', async () => {
    const res = await searchArticles(site, 'skolene', { limit: 10, offset: 0 });
    const slugs = res.items.map((i) => i.slug);
    expect(slugs).toContain('ny-skole-pa-storasen');
    expect(slugs).toContain('kommentar-skolene');
    expect(slugs).not.toContain('utkast-om-skole');
    expect(slugs).not.toContain('fremtidig-sak');
    expect(res.total).toBe(res.items.length);
    const hit = res.items.find((i) => i.slug === 'ny-skole-pa-storasen')!;
    expect(hit.headline.some((s) => s.highlight)).toBe(true);
    expect(hit.headline.map((s) => s.text).join('')).not.toContain('\u0002');
  });

  it('ranks titles above body text and supports web-search syntax', async () => {
    const res = await searchArticles(site, 'kommunestyret', { limit: 10, offset: 0 });
    expect(res.items[0]!.slug).toBe('budsjettet-vedtatt');
    const neg = await searchArticles(site, 'skole -kommentar', { limit: 10, offset: 0 });
    expect(neg.items.map((i) => i.slug)).not.toContain('kommentar-skolene');
    expect((await searchArticles(site, 'x', { limit: 10, offset: 0 })).items).toEqual([]);
    expect((await searchArticles(site, 'finnesikkeord', { limit: 10, offset: 0 })).total).toBe(0);
  });

  it('parseHeadline splits markers into segments', () => {
    expect(parseHeadline('Ny skole på Storåsen')).toEqual([
      { text: 'Ny ', highlight: false },
      { text: 'skole', highlight: true },
      { text: ' på Storåsen', highlight: false },
    ]);
  });
});

describe('layoutSource and layouts', () => {
  it('dedupes across blocks, skips sponsored auto-fill and honours pinned items', async () => {
    const source = layoutSource(site);
    const resolved = await resolveLayout(
      {
        version: 1,
        rows: [
          {
            id: 'r1',
            kind: 'row',
            columns: 2,
            blocks: [
              { id: 'hero', type: 'hero', settings: { limit: 1 }, items: [{ articleId: fx.ids.budsjett }] },
              { id: 'latest', type: 'latest', settings: { limit: 10 } },
            ],
          },
          {
            id: 'r2',
            kind: 'row',
            columns: 1,
            blocks: [{ id: 'most', type: 'most-read', settings: { limit: 5, days: 7, dedupe: false } }],
          },
        ],
      },
      source,
    );
    const [hero, latest] = resolved.rows[0]!.blocks;
    expect(hero!.articles.map((a) => a.slug)).toEqual(['budsjettet-vedtatt']);
    const latestSlugs = latest!.articles.map((a) => a.slug);
    expect(latestSlugs).not.toContain('budsjettet-vedtatt'); // deduped (and plus)
    expect(latestSlugs).not.toContain('slik-sparer-du-til-bolig'); // sponsored only when pinned
    expect(latestSlugs).toEqual([
      'ny-skole-pa-storasen',
      'kommentar-skolene',
      'elvebyen-vant-cupkampen',
      'barnesak',
    ]);
    const most = resolved.rows[1]!.blocks[0]!;
    expect(most.articles[0]!.slug).toBe('elvebyen-vant-cupkampen');
    expect(most.articles.map((a) => a.slug)).toContain('budsjettet-vedtatt'); // dedupe: false
  });

  it('byIds keeps the requested order and drops unpublished ids', async () => {
    const list = await layoutSource(site).byIds([fx.ids.fotball, fx.ids.utkast, fx.ids.skole]);
    expect(list.map((a) => a.slug)).toEqual(['elvebyen-vant-cupkampen', 'ny-skole-pa-storasen']);
  });

  it('getFrontLayout falls back to defaultFrontLayout, then uses the published layout', async () => {
    const fallback = await getFrontLayout(site);
    const sections = await listSections(site);
    expect(fallback.rows.length).toBe(defaultFrontLayout(sections).rows.length);
    expect(fallback.rows[0]!.blocks[0]!.type).toBe('hero');
    expect(fallback.rows[0]!.blocks[0]!.articles[0]!.slug).toBe('ny-skole-pa-storasen');

    await db.insert(layouts).values({
      siteId: site,
      key: 'front',
      name: 'Forsiden',
      draft: { version: 1, rows: [] },
      published: {
        version: 1,
        rows: [
          {
            id: 'only',
            kind: 'row',
            columns: 1,
            blocks: [{ id: 'b', type: 'list', settings: { limit: 2 } }],
          },
        ],
      },
      publishedAt: new Date(),
    });
    const published = await getFrontLayout(site);
    expect(published.rows).toHaveLength(1);
    expect(published.rows[0]!.blocks[0]!.articles).toHaveLength(2);
  });

  it('getSectionLayout returns null without a published section layout', async () => {
    expect(await getSectionLayout(site, seeded.sections.sport.id)).toBeNull();
    await db.insert(layouts).values({
      siteId: site,
      key: `section:${seeded.sections.sport.id}`,
      name: 'Sport',
      draft: { version: 1, rows: [] },
      published: {
        version: 1,
        rows: [
          {
            id: 'r',
            kind: 'row',
            columns: 1,
            blocks: [{ id: 'g', type: 'grid', settings: { sectionId: seeded.sections.sport.id, limit: 3 } }],
          },
        ],
      },
      publishedAt: new Date(),
    });
    const layout = await getSectionLayout(site, seeded.sections.sport.id);
    expect(layout?.rows[0]!.blocks[0]!.articles.map((a) => a.slug)).toEqual([
      'elvebyen-vant-cupkampen',
      'barnesak',
    ]);
  });
});

describe('taxonomy, menus and helpers', () => {
  it('listSections / getSectionBySlug', async () => {
    const list = await listSections(site);
    expect(list.map((s) => s.slug)).toContain('nyheter');
    expect((await getSectionBySlug(site, 'sport'))?.name).toBe('Sport');
    expect(await getSectionBySlug(site, 'finnes-ikke')).toBeNull();
  });

  it('getMenus validates items and keys by menu', async () => {
    const m = await getMenus(site);
    expect(m.primary).toEqual([{ id: 'a', label: 'Nyheter', href: '/nyheter' }]);
    expect(m.footer).toEqual([{ id: 'b', label: 'Om oss', href: '/om' }]);
  });

  it('getTagBySlug and getAuthorBySlug', async () => {
    expect((await getTagBySlug(site, 'fotball'))?.name).toBe('Fotball');
    expect(await getTagBySlug(site, 'nei')).toBeNull();
    const author = await getAuthorBySlug(site, 'julie-journalist');
    expect(author?.name).toBe('Julie Journalist');
    expect(author?.image).toBeNull();
  });

  it('getRelated excludes the article itself and stays in the section', async () => {
    const related = await getRelated(site, { id: fx.ids.skole, sectionId: seeded.sections.nyheter.id }, 5);
    expect(related.map((a) => a.slug)).toEqual(['kommentar-skolene', 'budsjettet-vedtatt']);
    expect(await getRelated(site, { id: fx.ids.skole, sectionId: null })).toEqual([]);
  });

  it('getBreaking returns breaking stories from the last 24 hours only', async () => {
    const breaking = await getBreaking(site);
    expect(breaking.map((a) => a.slug)).toEqual(['ny-skole-pa-storasen']);
  });

  it('listSitemapArticles and listFeedArticles cover published articles', async () => {
    const sitemap = await listSitemapArticles(site);
    expect(sitemap.map((a) => a.slug)).not.toContain('utkast-om-skole');
    expect(sitemap.find((a) => a.slug === 'ny-skole-pa-storasen')?.sectionSlug).toBe('nyheter');

    const feed = await listFeedArticles(site, { limit: 3 });
    expect(feed).toHaveLength(3);
    expect(feed[0]!.body.type).toBe('doc');
    expect(feed[0]!.tags).toEqual(['Kommunestyret']);
    const sport = await listFeedArticles(site, { sectionId: seeded.sections.sport.id, limit: 10 });
    expect(sport.every((a) => a.sectionSlug === 'sport' || a.sectionSlug === 'lokalfotball')).toBe(true);
  });
});
