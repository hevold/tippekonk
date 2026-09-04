/**
 * Layout engine (pure). Resolves a `LayoutDoc` — rows of blocks with pinned
 * items and auto-fill settings — into concrete article teasers using a
 * `LayoutSource` supplied by the caller (the public area wraps its cached
 * queries; tests pass in-memory fakes).
 *
 * Resolution rules (SPEC 4.6):
 *  - rows top-to-bottom, blocks left-to-right;
 *  - pinned `items` first, in order, with per-item overrides applied;
 *  - then auto-fill up to `limit` (`settings.limit` or DEFAULT_LIMITS);
 *    `manualOnly` disables auto-fill;
 *  - `dedupe !== false`: auto-fill skips articles already placed on the page
 *    (pinned items are editorial decisions and are always honoured, but never
 *    duplicated within one block);
 *  - `latest` never includes plus articles unless `settings.access === 'plus'`;
 *  - sponsored articles are placed only when pinned.
 */
import { nanoid } from 'nanoid';
import { z } from 'zod';

import type { ArticleAccess, LiveBlogStatus, Media, Section } from '@/db/schema';

import type {
  LayoutBlock,
  LayoutBlockSettings,
  LayoutBlockType,
  LayoutDoc,
  LayoutItem,
  LayoutItemOverrides,
  LayoutRow,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ArticleTeaser = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  slug: string;
  sectionSlug: string | null;
  sectionName: string | null;
  access: ArticleAccess;
  publishedAt: Date | null;
  updatedAt: Date;
  isBreaking: boolean;
  isSponsored: boolean;
  contentTypeKey: string;
  featuredMedia: Media | null;
  bylines: { name: string; slug: string }[];
  readingTimeMin: number;
};

export type LiveBlogSummary = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: LiveBlogStatus;
  startedAt: Date | null;
  updatedAt: Date;
  /** Number of visible posts, when known. */
  postCount?: number;
};

export type ResolvedBlock = LayoutBlock & { articles: ArticleTeaser[]; liveBlogs?: LiveBlogSummary[] };
export type ResolvedRow = Omit<LayoutRow, 'blocks'> & { blocks: ResolvedBlock[] };
export type ResolvedLayout = { rows: ResolvedRow[] };

export type LayoutQuery = {
  sectionId?: string;
  tagId?: string;
  contentTypeKey?: string;
  access?: ArticleAccess;
  limit: number;
  exclude: Set<string>;
  mostReadDays?: number;
  order: 'published' | 'most-read';
};

export type LayoutSource = {
  /** Published teasers for the given ids (any order; missing ids are skipped). */
  byIds(ids: string[]): Promise<ArticleTeaser[]>;
  /** Auto-fill query. Should honour `exclude` and `limit`; the engine filters again defensively. */
  query(q: LayoutQuery): Promise<ArticleTeaser[]>;
  /** Live blogs currently live (for 'live' blocks). */
  liveBlogs(): Promise<LiveBlogSummary[]>;
  /** Optional: media rows for pinned-item image overrides. Without it, image overrides are ignored. */
  media?(ids: string[]): Promise<Map<string, Media>>;
};

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

export const LAYOUT_BLOCK_TYPES: LayoutBlockType[] = [
  'hero',
  'top-stories',
  'grid',
  'list',
  'section-feed',
  'tag-feed',
  'latest',
  'most-read',
  'opinion',
  'live',
  'newsletter',
  'ad',
  'text',
  'heading',
  'plus',
];

/** Default auto-fill targets per block type. Non-article blocks are 0. */
export const DEFAULT_LIMITS: Record<LayoutBlockType, number> = {
  hero: 1,
  'top-stories': 4,
  grid: 3,
  list: 6,
  'section-feed': 4,
  'tag-feed': 4,
  latest: 10,
  'most-read': 5,
  opinion: 4,
  live: 3,
  newsletter: 0,
  ad: 0,
  text: 0,
  heading: 0,
  plus: 4,
};

/** Block types that never carry articles. */
export const STATIC_BLOCK_TYPES: ReadonlySet<LayoutBlockType> = new Set<LayoutBlockType>([
  'newsletter',
  'ad',
  'text',
  'heading',
]);

export const MAX_BLOCK_LIMIT = 50;

/** Extra query rounds when the source returns articles the engine must drop. */
const MAX_FILL_ROUNDS = 3;

/* -------------------------------------------------------------------------- */
/*  Schema                                                                     */
/* -------------------------------------------------------------------------- */

const idSchema = z.string().min(1).max(64);

export const layoutBlockTypeSchema = z.enum([
  'hero',
  'top-stories',
  'grid',
  'list',
  'section-feed',
  'tag-feed',
  'latest',
  'most-read',
  'opinion',
  'live',
  'newsletter',
  'ad',
  'text',
  'heading',
  'plus',
]);

export const layoutItemOverridesSchema: z.ZodType<LayoutItemOverrides> = z.object({
  title: z.string().max(300).optional(),
  lead: z.string().max(1000).optional(),
  imageMediaId: z.string().max(64).optional(),
  kicker: z.string().max(120).optional(),
});

export const layoutItemSchema: z.ZodType<LayoutItem> = z.object({
  articleId: z.string().min(1).max(64),
  overrides: layoutItemOverridesSchema.optional(),
});

export const blockSettingsSchema: z.ZodType<LayoutBlockSettings> = z.object({
  title: z.string().max(200).optional(),
  sectionId: z.string().max(64).optional(),
  tagId: z.string().max(64).optional(),
  contentTypeKey: z.string().max(64).optional(),
  limit: z.number().int().min(0).max(MAX_BLOCK_LIMIT).optional(),
  showImages: z.boolean().optional(),
  showLead: z.boolean().optional(),
  showKicker: z.boolean().optional(),
  showBylines: z.boolean().optional(),
  dedupe: z.boolean().optional(),
  manualOnly: z.boolean().optional(),
  text: z.unknown().optional(),
  slotId: z.string().max(120).optional(),
  href: z.string().max(1000).optional(),
  variant: z.string().max(40).optional(),
  days: z.number().int().min(1).max(365).optional(),
  access: z.enum(['open', 'plus']).optional(),
});

export const layoutBlockSchema: z.ZodType<LayoutBlock> = z.object({
  id: idSchema,
  type: layoutBlockTypeSchema,
  span: z.number().int().min(1).max(4).optional(),
  settings: blockSettingsSchema,
  items: z.array(layoutItemSchema).max(MAX_BLOCK_LIMIT).optional(),
});

export const layoutRowSchema: z.ZodType<LayoutRow> = z.object({
  id: idSchema,
  kind: z.literal('row'),
  title: z.string().max(200).optional(),
  columns: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  blocks: z.array(layoutBlockSchema).max(24),
  background: z.enum(['none', 'muted', 'accent']).optional(),
});

export const layoutDocSchema: z.ZodType<LayoutDoc> = z.object({
  version: z.literal(1),
  rows: z.array(layoutRowSchema).max(100),
});

/** Parse a stored layout leniently: invalid input yields an empty layout rather than an exception. */
export function parseLayoutDoc(raw: unknown): LayoutDoc {
  const result = layoutDocSchema.safeParse(raw);
  return result.success ? result.data : { version: 1, rows: [] };
}

/* -------------------------------------------------------------------------- */
/*  Builders                                                                   */
/* -------------------------------------------------------------------------- */

export function newBlock(
  type: LayoutBlockType,
  settings: LayoutBlockSettings = {},
  extra: { span?: number; items?: LayoutItem[] } = {},
): LayoutBlock {
  const block: LayoutBlock = { id: nanoid(10), type, settings: { ...settings } };
  if (extra.span && extra.span > 1) block.span = extra.span;
  if (extra.items && extra.items.length) block.items = extra.items;
  return block;
}

export function newRow(
  columns: LayoutRow['columns'],
  blocks: LayoutBlock[] = [],
  extra: { title?: string; background?: LayoutRow['background'] } = {},
): LayoutRow {
  const row: LayoutRow = { id: nanoid(10), kind: 'row', columns, blocks };
  if (extra.title) row.title = extra.title;
  if (extra.background && extra.background !== 'none') row.background = extra.background;
  return row;
}

/**
 * Sensible default front page: hero, top stories, section feeds for the
 * first menu sections (three per row), opinion + most read, and latest.
 */
export function defaultFrontLayout(sections: Section[]): LayoutDoc {
  const menuSections = sections
    .filter((s) => s.isActive && s.showInMenu && !s.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 6);

  const rows: LayoutRow[] = [
    newRow(1, [newBlock('hero', { showLead: true, showKicker: true, showBylines: true })]),
    newRow(1, [newBlock('top-stories', { showImages: true, showLead: true, showKicker: true })]),
  ];

  for (let i = 0; i < menuSections.length; i += 3) {
    const chunk = menuSections.slice(i, i + 3);
    rows.push(
      newRow(
        chunk.length as LayoutRow['columns'],
        chunk.map((s) =>
          newBlock('section-feed', {
            title: s.name,
            sectionId: s.id,
            showImages: true,
            showKicker: true,
          }),
        ),
      ),
    );
  }

  rows.push(
    newRow(2, [
      newBlock('opinion', { title: 'Meninger', showBylines: true }),
      newBlock('most-read', { title: 'Mest lest', days: 7 }),
    ]),
    newRow(1, [newBlock('latest', { title: 'Siste nytt', showImages: true, showKicker: true })]),
  );

  return { version: 1, rows };
}

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                 */
/* -------------------------------------------------------------------------- */

function applyOverrides(
  teaser: ArticleTeaser,
  overrides: LayoutItemOverrides | undefined,
  media: Map<string, Media>,
) {
  if (!overrides) return teaser;
  const out: ArticleTeaser = { ...teaser };
  if (overrides.title?.trim()) out.title = overrides.title.trim();
  if (overrides.lead?.trim()) out.lead = overrides.lead.trim();
  if (overrides.kicker?.trim()) out.kicker = overrides.kicker.trim();
  if (overrides.imageMediaId) {
    const m = media.get(overrides.imageMediaId);
    if (m) out.featuredMedia = m;
  }
  return out;
}

function effectiveLimit(block: LayoutBlock): number {
  const configured = block.settings.limit;
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) {
    return Math.min(MAX_BLOCK_LIMIT, Math.floor(configured));
  }
  return DEFAULT_LIMITS[block.type] ?? 0;
}

function buildQuery(block: LayoutBlock, limit: number, exclude: Set<string>): LayoutQuery | null {
  const s = block.settings;
  const base: LayoutQuery = { limit, exclude, order: 'published' };
  if (s.access) base.access = s.access;
  switch (block.type) {
    case 'hero':
    case 'top-stories':
    case 'grid':
    case 'list':
      if (s.sectionId) base.sectionId = s.sectionId;
      if (s.tagId) base.tagId = s.tagId;
      if (s.contentTypeKey) base.contentTypeKey = s.contentTypeKey;
      return base;
    case 'section-feed':
      if (!s.sectionId) return null;
      base.sectionId = s.sectionId;
      return base;
    case 'tag-feed':
      if (!s.tagId) return null;
      base.tagId = s.tagId;
      return base;
    case 'latest':
      base.access = s.access === 'plus' ? 'plus' : 'open';
      if (s.sectionId) base.sectionId = s.sectionId;
      return base;
    case 'most-read':
      base.order = 'most-read';
      base.mostReadDays = s.days && s.days > 0 ? s.days : 7;
      if (s.sectionId) base.sectionId = s.sectionId;
      return base;
    case 'opinion':
      base.contentTypeKey = s.contentTypeKey || 'opinion';
      if (s.sectionId) base.sectionId = s.sectionId;
      return base;
    case 'plus':
      base.access = 'plus';
      if (s.sectionId) base.sectionId = s.sectionId;
      return base;
    default:
      return null;
  }
}

async function loadPinned(
  block: LayoutBlock,
  source: LayoutSource,
): Promise<{ articles: ArticleTeaser[]; ids: Set<string> }> {
  const items = (block.items ?? []).filter((it) => it && typeof it.articleId === 'string' && it.articleId);
  const ids = new Set<string>();
  if (!items.length) return { articles: [], ids };

  const uniqueIds = [...new Set(items.map((it) => it.articleId))];
  const found = await source.byIds(uniqueIds);
  const byId = new Map(found.map((a) => [a.id, a]));

  const mediaIds = items.map((it) => it.overrides?.imageMediaId).filter((id): id is string => Boolean(id));
  const media =
    mediaIds.length && source.media ? await source.media([...new Set(mediaIds)]) : new Map<string, Media>();

  const articles: ArticleTeaser[] = [];
  for (const item of items) {
    if (ids.has(item.articleId)) continue;
    const teaser = byId.get(item.articleId);
    if (!teaser) continue;
    ids.add(item.articleId);
    articles.push(applyOverrides(teaser, item.overrides, media));
  }
  return { articles, ids };
}

async function resolveBlock(
  block: LayoutBlock,
  source: LayoutSource,
  placed: Set<string>,
): Promise<ResolvedBlock> {
  if (STATIC_BLOCK_TYPES.has(block.type)) {
    return { ...block, articles: [] };
  }
  if (block.type === 'live') {
    const limit = effectiveLimit(block);
    const all = await source.liveBlogs();
    return { ...block, articles: [], liveBlogs: limit > 0 ? all.slice(0, limit) : all };
  }

  const { articles, ids } = await loadPinned(block, source);
  const limit = effectiveLimit(block);
  const remaining = limit - articles.length;
  const dedupe = block.settings.dedupe !== false;

  if (!block.settings.manualOnly && remaining > 0) {
    const exclude = new Set<string>(ids);
    if (dedupe) for (const id of placed) exclude.add(id);
    // Sources receive a snapshot so later bookkeeping never mutates what they saw.
    const first = buildQuery(block, remaining, new Set(exclude));
    if (first) {
      // The source may return articles the engine must drop (sponsored, wrong
      // access). When that leaves the block short and the source returned a
      // full page, ask again with the rejected ids excluded — a few rounds at most.
      let query: LayoutQuery = first;
      for (let round = 0; round < MAX_FILL_ROUNDS && articles.length < limit; round++) {
        const filled = await source.query(query);
        let rejected = 0;
        for (const teaser of filled) {
          if (articles.length >= limit) break;
          if (!teaser || exclude.has(teaser.id)) continue;
          exclude.add(teaser.id);
          if (teaser.isSponsored) {
            rejected += 1; // sponsored only when pinned
            continue;
          }
          if (query.access && teaser.access !== query.access) {
            rejected += 1;
            continue;
          }
          articles.push(teaser);
        }
        const shortfall = limit - articles.length;
        if (shortfall <= 0 || rejected === 0 || filled.length < query.limit) break;
        query = { ...query, limit: shortfall, exclude: new Set(exclude) };
      }
    }
  }

  for (const a of articles) placed.add(a.id);
  return { ...block, articles };
}

/** Resolve a layout into concrete teasers. Blocks are resolved sequentially so dedupe is deterministic. */
export async function resolveLayout(doc: LayoutDoc, source: LayoutSource): Promise<ResolvedLayout> {
  const placed = new Set<string>();
  const rows: ResolvedRow[] = [];
  for (const row of doc?.rows ?? []) {
    const blocks: ResolvedBlock[] = [];
    for (const block of row.blocks ?? []) {
      blocks.push(await resolveBlock(block, source, placed));
    }
    const { blocks: _ignored, ...rest } = row;
    void _ignored;
    rows.push({ ...rest, blocks });
  }
  return { rows };
}

/** All article ids pinned anywhere in a layout (for validation and preloading). */
export function layoutPinnedIds(doc: LayoutDoc): string[] {
  const ids = new Set<string>();
  for (const row of doc.rows ?? []) {
    for (const block of row.blocks ?? []) {
      for (const item of block.items ?? []) if (item.articleId) ids.add(item.articleId);
    }
  }
  return [...ids];
}
