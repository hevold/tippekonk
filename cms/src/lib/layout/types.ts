/**
 * Front page / section page layout model (forsideredigering).
 *
 * A layout is a list of rows; each row has 1–4 columns and a list of blocks.
 * A block either lists pinned articles (`items`) and/or auto-fills from a
 * query described by `settings`. The layout engine (src/lib/layout/engine.ts)
 * resolves a `LayoutDoc` into a `ResolvedLayout` with concrete articles,
 * de-duplicating articles across blocks unless `settings.dedupe === false`.
 */

export type LayoutBlockType =
  | 'hero' // one big story
  | 'top-stories' // N stories, first large
  | 'grid' // cards in the row's columns
  | 'list' // compact list, optional thumbnails
  | 'section-feed' // auto from a section
  | 'tag-feed' // auto from a tag
  | 'latest' // newest published
  | 'most-read' // by article_views
  | 'opinion' // articles of content type 'opinion'
  | 'live' // active live blogs
  | 'newsletter' // sign-up box (link-based)
  | 'ad' // ad slot placeholder
  | 'text' // rich text promo (ContentDoc)
  | 'heading' // row heading / divider
  | 'plus'; // plus (paywalled) stories

export type LayoutItemOverrides = {
  title?: string;
  lead?: string;
  imageMediaId?: string;
  kicker?: string;
};

export type LayoutItem = {
  articleId: string;
  overrides?: LayoutItemOverrides;
};

export type LayoutBlockSettings = {
  title?: string;
  sectionId?: string;
  tagId?: string;
  contentTypeKey?: string;
  /** Number of articles to show (auto-fill target). */
  limit?: number;
  showImages?: boolean;
  showLead?: boolean;
  showKicker?: boolean;
  showBylines?: boolean;
  /** Default true: skip articles already used higher up on the page. */
  dedupe?: boolean;
  /** Only pinned items, no auto-fill. */
  manualOnly?: boolean;
  /** Free text / doc for 'text' blocks. */
  text?: unknown;
  /** 'ad' blocks: identifier for the ad server slot. */
  slotId?: string;
  /** Link for 'newsletter' block CTA. */
  href?: string;
  /** Visual variant hint, e.g. 'default' | 'muted' | 'accent' | 'dark'. */
  variant?: string;
  /** Most-read window in days. */
  days?: number;
};

export type LayoutBlock = {
  id: string;
  type: LayoutBlockType;
  /** How many of the row's columns this block spans (default 1). */
  span?: number;
  settings: LayoutBlockSettings;
  items?: LayoutItem[];
};

export type LayoutRow = {
  id: string;
  kind: 'row';
  title?: string;
  columns: 1 | 2 | 3 | 4;
  blocks: LayoutBlock[];
  background?: 'none' | 'muted' | 'accent';
};

export type LayoutDoc = {
  version: 1;
  rows: LayoutRow[];
};

export const EMPTY_LAYOUT: LayoutDoc = { version: 1, rows: [] };
