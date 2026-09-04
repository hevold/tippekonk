/**
 * Block catalogue for the front page editor: Norwegian label and description,
 * lucide icon name, default settings and capabilities per block type. The
 * layout editor (integrations area) renders the palette from this; the
 * engine (./engine.ts) does not depend on it.
 */
import type { LayoutBlockSettings, LayoutBlockType } from './types';

export type BlockCategory = 'stories' | 'automatic' | 'other';

export type BlockDefinition = {
  type: LayoutBlockType;
  /** Bokmål label shown in the palette. */
  label: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  category: BlockCategory;
  defaultSettings: LayoutBlockSettings;
  /** Whether editors can pin articles (`items`) in this block. */
  supportsItems: boolean;
  /** Whether the block auto-fills from a query. */
  autoFills: boolean;
  /** Default column span within a row. */
  defaultSpan: number;
  /** Which settings the editor should expose. */
  settingFields: (keyof LayoutBlockSettings)[];
};

const STORY_FIELDS: (keyof LayoutBlockSettings)[] = [
  'title',
  'limit',
  'sectionId',
  'showImages',
  'showLead',
  'showKicker',
  'showBylines',
  'dedupe',
  'manualOnly',
  'variant',
];

export const BLOCK_DEFINITIONS: Record<LayoutBlockType, BlockDefinition> = {
  hero: {
    type: 'hero',
    label: 'Toppsak',
    description: 'Én stor sak med bilde, tittel og ingress.',
    icon: 'Newspaper',
    category: 'stories',
    defaultSettings: { limit: 1, showImages: true, showLead: true, showKicker: true, showBylines: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: STORY_FIELDS,
  },
  'top-stories': {
    type: 'top-stories',
    label: 'Hovedsaker',
    description: 'Flere saker der den første vises størst.',
    icon: 'LayoutTemplate',
    category: 'stories',
    defaultSettings: { limit: 4, showImages: true, showLead: true, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: STORY_FIELDS,
  },
  grid: {
    type: 'grid',
    label: 'Rutenett',
    description: 'Kort i radens kolonner.',
    icon: 'LayoutGrid',
    category: 'stories',
    defaultSettings: { limit: 3, showImages: true, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: STORY_FIELDS,
  },
  list: {
    type: 'list',
    label: 'Liste',
    description: 'Kompakt liste, eventuelt med små bilder.',
    icon: 'List',
    category: 'stories',
    defaultSettings: { limit: 6, showImages: false, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: STORY_FIELDS,
  },
  'section-feed': {
    type: 'section-feed',
    label: 'Seksjon',
    description: 'Siste saker fra en seksjon.',
    icon: 'FolderTree',
    category: 'automatic',
    defaultSettings: { limit: 4, showImages: true, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: [
      'title',
      'sectionId',
      'limit',
      'showImages',
      'showLead',
      'showKicker',
      'dedupe',
      'variant',
    ],
  },
  'tag-feed': {
    type: 'tag-feed',
    label: 'Stikkord',
    description: 'Siste saker med et bestemt stikkord.',
    icon: 'Tag',
    category: 'automatic',
    defaultSettings: { limit: 4, showImages: true, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: ['title', 'tagId', 'limit', 'showImages', 'showLead', 'showKicker', 'dedupe', 'variant'],
  },
  latest: {
    type: 'latest',
    label: 'Siste nytt',
    description: 'De nyeste publiserte sakene. Pluss-saker bare når det er valgt.',
    icon: 'Clock',
    category: 'automatic',
    defaultSettings: { limit: 10, showImages: true, showKicker: true, access: 'open' },
    supportsItems: false,
    autoFills: true,
    defaultSpan: 1,
    settingFields: ['title', 'limit', 'sectionId', 'access', 'showImages', 'showKicker', 'dedupe', 'variant'],
  },
  'most-read': {
    type: 'most-read',
    label: 'Mest lest',
    description: 'Sakene med flest sidevisninger de siste dagene.',
    icon: 'TrendingUp',
    category: 'automatic',
    defaultSettings: { limit: 5, days: 7, showImages: false },
    supportsItems: false,
    autoFills: true,
    defaultSpan: 1,
    settingFields: ['title', 'limit', 'days', 'sectionId', 'showImages', 'dedupe', 'variant'],
  },
  opinion: {
    type: 'opinion',
    label: 'Meninger',
    description: 'Kommentarer, ledere og debattinnlegg.',
    icon: 'MessageSquareQuote',
    category: 'automatic',
    defaultSettings: { limit: 4, contentTypeKey: 'opinion', showBylines: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: ['title', 'limit', 'contentTypeKey', 'showImages', 'showBylines', 'dedupe', 'variant'],
  },
  live: {
    type: 'live',
    label: 'Direkte',
    description: 'Pågående direktesendinger.',
    icon: 'Radio',
    category: 'automatic',
    defaultSettings: { limit: 3 },
    supportsItems: false,
    autoFills: true,
    defaultSpan: 1,
    settingFields: ['title', 'limit', 'variant'],
  },
  plus: {
    type: 'plus',
    label: 'Pluss',
    description: 'Saker bak betalingsmur.',
    icon: 'Star',
    category: 'automatic',
    defaultSettings: { limit: 4, showImages: true, showKicker: true },
    supportsItems: true,
    autoFills: true,
    defaultSpan: 1,
    settingFields: [
      'title',
      'limit',
      'sectionId',
      'showImages',
      'showLead',
      'showKicker',
      'dedupe',
      'variant',
    ],
  },
  newsletter: {
    type: 'newsletter',
    label: 'Nyhetsbrev',
    description: 'Boks med lenke til påmelding.',
    icon: 'Mail',
    category: 'other',
    defaultSettings: { title: 'Få nyhetene rett i innboksen', href: '/nyhetsbrev', variant: 'accent' },
    supportsItems: false,
    autoFills: false,
    defaultSpan: 1,
    settingFields: ['title', 'href', 'variant'],
  },
  ad: {
    type: 'ad',
    label: 'Annonse',
    description: 'Plassholder for annonsesystemet.',
    icon: 'Megaphone',
    category: 'other',
    defaultSettings: { slotId: '' },
    supportsItems: false,
    autoFills: false,
    defaultSpan: 1,
    settingFields: ['slotId', 'variant'],
  },
  text: {
    type: 'text',
    label: 'Tekst',
    description: 'Fri tekst, for eksempel en melding fra redaksjonen.',
    icon: 'Type',
    category: 'other',
    defaultSettings: { variant: 'muted' },
    supportsItems: false,
    autoFills: false,
    defaultSpan: 1,
    settingFields: ['title', 'text', 'variant'],
  },
  heading: {
    type: 'heading',
    label: 'Overskrift',
    description: 'Overskrift eller skillelinje mellom rader.',
    icon: 'Heading',
    category: 'other',
    defaultSettings: { title: '' },
    supportsItems: false,
    autoFills: false,
    defaultSpan: 4,
    settingFields: ['title', 'href', 'variant'],
  },
};

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = {
  stories: 'Saker',
  automatic: 'Automatisk',
  other: 'Annet',
};

/** Definitions grouped by category, in palette order. */
export function blockDefinitionsByCategory(): {
  category: BlockCategory;
  label: string;
  blocks: BlockDefinition[];
}[] {
  const categories: BlockCategory[] = ['stories', 'automatic', 'other'];
  return categories.map((category) => ({
    category,
    label: BLOCK_CATEGORY_LABELS[category],
    blocks: Object.values(BLOCK_DEFINITIONS).filter((d) => d.category === category),
  }));
}

export function blockLabel(type: LayoutBlockType): string {
  return BLOCK_DEFINITIONS[type]?.label ?? type;
}
