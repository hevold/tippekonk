import { describe, expect, it } from 'vitest';

import type { Media, Section } from '@/db/schema';

import {
  DEFAULT_LIMITS,
  defaultFrontLayout,
  layoutDocSchema,
  layoutPinnedIds,
  newBlock,
  newRow,
  parseLayoutDoc,
  resolveLayout,
  type ArticleTeaser,
  type LayoutQuery,
  type LayoutSource,
  type LiveBlogSummary,
} from './engine';
import type { LayoutDoc } from './types';

function teaser(id: string, extra: Partial<ArticleTeaser> = {}): ArticleTeaser {
  return {
    id,
    title: `Sak ${id}`,
    kicker: null,
    lead: null,
    slug: `sak-${id}`,
    sectionSlug: 'nyheter',
    sectionName: 'Nyheter',
    access: 'open',
    publishedAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    isBreaking: false,
    isSponsored: false,
    contentTypeKey: 'article',
    featuredMedia: null,
    bylines: [],
    readingTimeMin: 1,
    ...extra,
  };
}

/** In-memory source that mimics the public query semantics. */
function makeSource(pool: ArticleTeaser[], live: LiveBlogSummary[] = []) {
  const queries: LayoutQuery[] = [];
  const source: LayoutSource = {
    async byIds(ids) {
      return pool.filter((a) => ids.includes(a.id));
    },
    async query(q) {
      queries.push(q);
      return pool
        .filter((a) => !q.exclude.has(a.id))
        .filter((a) => (q.sectionId ? a.sectionSlug === q.sectionId : true))
        .filter((a) => (q.contentTypeKey ? a.contentTypeKey === q.contentTypeKey : true))
        .filter((a) => (q.access ? a.access === q.access : true))
        .slice(0, q.limit);
    },
    async liveBlogs() {
      return live;
    },
    async media(ids) {
      return new Map(ids.map((id) => [id, { id, storageKey: `${id}.jpg` } as unknown as Media]));
    },
  };
  return { source, queries };
}

const pool = [
  teaser('1'),
  teaser('2'),
  teaser('3', { isSponsored: true }),
  teaser('4', { access: 'plus' }),
  teaser('5', { contentTypeKey: 'opinion' }),
  teaser('6'),
  teaser('7'),
  teaser('8', { sectionSlug: 'sport' }),
];

describe('resolveLayout', () => {
  it('places pinned items first, in order, then auto-fills to the limit', async () => {
    const { source } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(1, [
          newBlock('top-stories', { limit: 4 }, { items: [{ articleId: '7' }, { articleId: '2' }] }),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    // '3' is sponsored (never auto-filled); '4' is plus, which top-stories allows.
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['7', '2', '1', '4']);
  });

  it('re-queries when the source returns articles the engine must drop', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = { version: 1, rows: [newRow(1, [newBlock('list', { limit: 3 })])] };
    const out = await resolveLayout(doc, source);
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['1', '2', '4']);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toMatchObject({ limit: 3 });
    expect(queries[1]!.limit).toBe(1);
    expect([...queries[1]!.exclude].sort()).toEqual(['1', '2', '3']);
  });

  it('applies overrides to pinned items, including image via source.media', async () => {
    const { source } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(1, [
          newBlock(
            'hero',
            { manualOnly: true },
            {
              items: [
                { articleId: '1', overrides: { title: 'Ny tittel', kicker: 'K', imageMediaId: 'img9' } },
              ],
            },
          ),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    const a = out.rows[0]!.blocks[0]!.articles[0]!;
    expect(a.title).toBe('Ny tittel');
    expect(a.kicker).toBe('K');
    expect(a.featuredMedia?.id).toBe('img9');
  });

  it('dedupes across blocks by default and allows opting out', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(1, [newBlock('hero')]),
        newRow(2, [newBlock('list', { limit: 2 }), newBlock('list', { limit: 2, dedupe: false })]),
      ],
    };
    const out = await resolveLayout(doc, source);
    const [hero] = out.rows[0]!.blocks;
    const [list, listNoDedupe] = out.rows[1]!.blocks;
    expect(hero!.articles.map((a) => a.id)).toEqual(['1']);
    expect(list!.articles.map((a) => a.id)).toEqual(['2', '4']);
    expect(listNoDedupe!.articles.map((a) => a.id)).toEqual(['1', '2']);
    // hero query, list first round, list second round (sponsored '3' dropped), list without dedupe
    expect(queries.map((q) => [...q.exclude].sort())).toEqual([[], ['1'], ['1', '2', '3'], []]);
  });

  it('manualOnly disables auto-fill', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [newRow(1, [newBlock('grid', { manualOnly: true }, { items: [{ articleId: '6' }] })])],
    };
    const out = await resolveLayout(doc, source);
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['6']);
    expect(queries).toHaveLength(0);
  });

  it('respects limits and DEFAULT_LIMITS', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [newRow(1, [newBlock('latest'), newBlock('list', { limit: 1 })])],
    };
    const out = await resolveLayout(doc, source);
    expect(DEFAULT_LIMITS.latest).toBe(10);
    expect(queries[0]!.limit).toBe(10);
    expect(out.rows[0]!.blocks[1]!.articles).toHaveLength(1);
    expect(DEFAULT_LIMITS).toMatchObject({
      hero: 1,
      'top-stories': 4,
      grid: 3,
      list: 6,
      'section-feed': 4,
      latest: 10,
      'most-read': 5,
      opinion: 4,
      live: 3,
      plus: 4,
    });
  });

  it('never returns more than limit even with many pinned items', async () => {
    const { source } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [newRow(1, [newBlock('hero', {}, { items: [{ articleId: '1' }, { articleId: '2' }] })])],
    };
    const out = await resolveLayout(doc, source);
    // Pinned items are editorial decisions and are all kept; no auto-fill happens beyond them.
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['1', '2']);
  });

  it('latest excludes plus unless access is plus', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [newRow(1, [newBlock('latest'), newBlock('latest', { access: 'plus', dedupe: false })])],
    };
    const out = await resolveLayout(doc, source);
    expect(queries[0]!.access).toBe('open');
    expect(out.rows[0]!.blocks[0]!.articles.some((a) => a.access === 'plus')).toBe(false);
    expect(queries[1]!.access).toBe('plus');
    expect(out.rows[0]!.blocks[1]!.articles.map((a) => a.id)).toEqual(['4']);
  });

  it('filters plus out of latest even when the source ignores access', async () => {
    const leaky: LayoutSource = {
      byIds: async () => [],
      query: async () => [teaser('4', { access: 'plus' }), teaser('1')],
      liveBlogs: async () => [],
    };
    const out = await resolveLayout({ version: 1, rows: [newRow(1, [newBlock('latest')])] }, leaky);
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['1']);
  });

  it('places sponsored articles only when pinned', async () => {
    const { source } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(1, [
          newBlock('list', { limit: 10 }),
          newBlock('list', { limit: 1 }, { items: [{ articleId: '3' }] }),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    expect(out.rows[0]!.blocks[0]!.articles.some((a) => a.isSponsored)).toBe(false);
    expect(out.rows[0]!.blocks[1]!.articles.map((a) => a.id)).toEqual(['3']);
  });

  it('builds type-specific queries', async () => {
    const { source, queries } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(4, [
          newBlock('section-feed', { sectionId: 'sport' }),
          newBlock('opinion'),
          newBlock('most-read', { days: 3 }),
          newBlock('plus'),
          newBlock('tag-feed', {}),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    const find = (pred: (q: LayoutQuery) => boolean) => queries.find(pred);
    expect(find((q) => q.sectionId === 'sport')).toMatchObject({ order: 'published' });
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['8']);
    expect(find((q) => q.contentTypeKey === 'opinion')).toBeDefined();
    expect(out.rows[0]!.blocks[1]!.articles.map((a) => a.id)).toEqual(['5']);
    expect(find((q) => q.order === 'most-read')).toMatchObject({ mostReadDays: 3 });
    expect(find((q) => q.access === 'plus')).toBeDefined();
    expect(out.rows[0]!.blocks[3]!.articles.every((a) => a.access === 'plus')).toBe(true);
    // tag-feed without tagId performs no query
    expect(queries.some((q) => q.tagId !== undefined)).toBe(false);
    expect(out.rows[0]!.blocks[4]!.articles).toEqual([]);
  });

  it('resolves live blocks and static blocks', async () => {
    const live: LiveBlogSummary[] = [
      {
        id: 'l1',
        title: 'A',
        slug: 'a',
        description: null,
        status: 'live',
        startedAt: null,
        updatedAt: new Date(),
      },
      {
        id: 'l2',
        title: 'B',
        slug: 'b',
        description: null,
        status: 'live',
        startedAt: null,
        updatedAt: new Date(),
      },
    ];
    const { source, queries } = makeSource(pool, live);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(2, [
          newBlock('live', { limit: 1 }),
          newBlock('ad', { slotId: 'top' }),
          newBlock('text'),
          newBlock('heading'),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    expect(out.rows[0]!.blocks[0]!.liveBlogs?.map((l) => l.id)).toEqual(['l1']);
    expect(out.rows[0]!.blocks[1]!.articles).toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it('skips pinned ids that are not published and dedupes pinned within a block', async () => {
    const { source } = makeSource(pool);
    const doc: LayoutDoc = {
      version: 1,
      rows: [
        newRow(1, [
          newBlock(
            'list',
            { limit: 3 },
            { items: [{ articleId: 'gone' }, { articleId: '2' }, { articleId: '2' }] },
          ),
        ]),
      ],
    };
    const out = await resolveLayout(doc, source);
    expect(out.rows[0]!.blocks[0]!.articles.map((a) => a.id)).toEqual(['2', '1', '4']);
  });

  it('handles an empty layout', async () => {
    const { source } = makeSource(pool);
    expect(await resolveLayout({ version: 1, rows: [] }, source)).toEqual({ rows: [] });
  });
});

describe('layoutDocSchema', () => {
  it('accepts a valid document and strips unknown keys', () => {
    const doc = {
      version: 1,
      rows: [
        {
          id: 'r1',
          kind: 'row',
          columns: 2,
          blocks: [
            { id: 'b1', type: 'hero', settings: { limit: 1, junk: true }, items: [{ articleId: 'a' }] },
          ],
          junk: 1,
        },
      ],
    };
    const parsed = layoutDocSchema.parse(doc);
    expect(parsed.rows[0]!.blocks[0]!.settings).toEqual({ limit: 1 });
    expect((parsed.rows[0] as unknown as { junk?: unknown }).junk).toBeUndefined();
  });
  it('rejects invalid input, parseLayoutDoc falls back to empty', () => {
    expect(layoutDocSchema.safeParse({ version: 2, rows: [] }).success).toBe(false);
    expect(
      layoutDocSchema.safeParse({ version: 1, rows: [{ id: 'r', kind: 'row', columns: 5, blocks: [] }] })
        .success,
    ).toBe(false);
    expect(
      layoutDocSchema.safeParse({
        version: 1,
        rows: [{ id: 'r', kind: 'row', columns: 1, blocks: [{ id: 'b', type: 'nope', settings: {} }] }],
      }).success,
    ).toBe(false);
    expect(parseLayoutDoc('garbage')).toEqual({ version: 1, rows: [] });
  });
});

describe('defaultFrontLayout', () => {
  const section = (id: string, name: string, extra: Partial<Section> = {}): Section =>
    ({
      id,
      name,
      slug: id,
      isActive: true,
      showInMenu: true,
      parentId: null,
      sortOrder: 0,
      ...extra,
    }) as Section;

  it('builds hero, top stories, section feeds, opinion/most-read and latest', () => {
    const doc = defaultFrontLayout([
      section('nyheter', 'Nyheter'),
      section('sport', 'Sport', { sortOrder: 1 }),
      section('kultur', 'Kultur', { sortOrder: 2 }),
      section('debatt', 'Debatt', { parentId: 'meninger' }),
      section('skjult', 'Skjult', { showInMenu: false }),
    ]);
    expect(layoutDocSchema.safeParse(doc).success).toBe(true);
    const types = doc.rows.map((r) => r.blocks.map((b) => b.type));
    expect(types[0]).toEqual(['hero']);
    expect(types[1]).toEqual(['top-stories']);
    expect(types[2]).toEqual(['section-feed', 'section-feed', 'section-feed']);
    expect(doc.rows[2]!.columns).toBe(3);
    expect(doc.rows[2]!.blocks.map((b) => b.settings.sectionId)).toEqual(['nyheter', 'sport', 'kultur']);
    expect(types[3]).toEqual(['opinion', 'most-read']);
    expect(types[4]).toEqual(['latest']);
    const ids = doc.rows.flatMap((r) => [r.id, ...r.blocks.map((b) => b.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(layoutPinnedIds(doc)).toEqual([]);
  });
});
