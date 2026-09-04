/**
 * Article input and list-filter schemas, shared by the editor page (client
 * form) and the article service (server). `articleInputSchema` describes
 * the full editable payload of a save; partial updates use `.partial()`.
 */
import { z } from 'zod';

import { contentDocSchema } from '@/lib/content/schema';

import {
  formBoolean,
  nullableDate,
  nullableText,
  optionalUuidSchema,
  paginationSchema,
  slugSchema,
  trimmed,
  uuidSchema,
} from './common';

export { customFieldValuesSchema, validateCustomFields } from './custom-fields';

export const ARTICLE_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'unpublished',
  'archived',
] as const;
export const articleStatusSchema = z.enum(ARTICLE_STATUSES);

export const articleAccessSchema = z.enum(['open', 'plus']);

export const bylineRoleSchema = z.enum(['text', 'photo', 'video', 'graphics', 'other']);

export const bylineInputSchema = z.object({
  authorId: uuidSchema,
  role: bylineRoleSchema.default('text'),
});
export type BylineInput = z.infer<typeof bylineInputSchema>;

export const TITLE_MAX = 300;
export const KICKER_MAX = 120;
export const LEAD_MAX = 1000;
export const SEO_TITLE_MAX = 120;
export const SEO_DESCRIPTION_MAX = 320;

export const articleInputSchema = z.object({
  title: trimmed(TITLE_MAX, 'Tittelen').default(''),
  kicker: nullableText(KICKER_MAX, 'Stikktittelen').default(null),
  lead: nullableText(LEAD_MAX, 'Ingressen').default(null),
  /** Empty slug means "generate from the title" (service decides). */
  slug: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.union([slugSchema, z.literal('')]),
    )
    .default(''),
  sectionId: optionalUuidSchema.default(null),
  contentTypeId: optionalUuidSchema.default(null),
  access: articleAccessSchema.default('open'),
  body: contentDocSchema.default({ type: 'doc', content: [] }),
  customFields: z.record(z.string(), z.unknown()).default({}),
  featuredMediaId: optionalUuidSchema.default(null),
  featuredCaption: nullableText(2000, 'Bildeteksten').default(null),
  featuredCredit: nullableText(300, 'Fotokrediteringen').default(null),
  seoTitle: nullableText(SEO_TITLE_MAX, 'SEO-tittelen').default(null),
  seoDescription: nullableText(SEO_DESCRIPTION_MAX, 'SEO-beskrivelsen').default(null),
  canonicalUrl: nullableText(2000, 'Kanonisk URL').default(null),
  noIndex: formBoolean.default(false),
  tagIds: z.array(uuidSchema).max(50, 'Maks 50 stikkord').default([]),
  bylines: z.array(bylineInputSchema).max(20, 'Maks 20 bylines').default([]),
  relatedIds: z.array(uuidSchema).max(20).default([]),
  isBreaking: formBoolean.default(false),
  isSponsored: formBoolean.default(false),
  flags: z.record(z.string(), z.boolean()).default({}),
  assignedTo: optionalUuidSchema.default(null),
  deadlineAt: nullableDate.default(null),
  plannedAt: nullableDate.default(null),
});

export type ArticleInput = z.infer<typeof articleInputSchema>;
export type ArticleInputRaw = z.input<typeof articleInputSchema>;

/** Partial payload for autosave/patch operations. */
export const articlePatchSchema = articleInputSchema.partial();
export type ArticlePatch = z.infer<typeof articlePatchSchema>;

export const ARTICLE_SORT_FIELDS = [
  'updatedAt',
  'publishedAt',
  'title',
  'createdAt',
  'status',
  'deadlineAt',
] as const;
export type ArticleSortField = (typeof ARTICLE_SORT_FIELDS)[number];

const sortValues = ARTICLE_SORT_FIELDS.flatMap((f) => [f, `-${f}`] as const);

/** Search-param helper: '' and undefined mean "not set". */
const blank = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? undefined : v), schema.optional());

export const articleFilterSchema = z.object({
  status: blank(z.union([articleStatusSchema, z.literal('trash'), z.literal('mine')])),
  sectionId: blank(uuidSchema),
  contentTypeId: blank(uuidSchema),
  tagId: blank(uuidSchema),
  q: z.string().trim().max(200).optional(),
  authorId: blank(uuidSchema),
  assignedTo: blank(uuidSchema),
  access: blank(articleAccessSchema),
  sort: z.preprocess(
    (v) => (v === '' || v === undefined ? '-updatedAt' : v),
    z.enum(sortValues as unknown as [string, ...string[]]),
  ),
  page: paginationSchema.shape.page,
  perPage: paginationSchema.shape.perPage,
});

export type ArticleFilter = z.infer<typeof articleFilterSchema>;

/** Split a sort value like "-updatedAt" into field + direction. */
export function parseArticleSort(sort: string): { field: ArticleSortField; direction: 'asc' | 'desc' } {
  const desc = sort.startsWith('-');
  const field = sort.replace(/^-/, '') as ArticleSortField;
  return {
    field: ARTICLE_SORT_FIELDS.includes(field) ? field : 'updatedAt',
    direction: desc ? 'desc' : 'asc',
  };
}

export const articleTransitionSchema = z.object({
  id: uuidSchema,
  to: articleStatusSchema,
  scheduledAt: nullableDate.optional(),
  note: z.string().trim().max(1000).optional(),
});

export const articleNoteSchema = z.object({
  articleId: uuidSchema,
  body: z.string().trim().min(1, 'Skriv en melding').max(5000),
});
