/**
 * Live blog (direktestudio) schemas.
 */
import { z } from 'zod';

import { contentDocSchema, isEmptyDoc } from '@/lib/content/schema';

import {
  formBoolean,
  nullableDate,
  nullableText,
  optionalUuidSchema,
  slugSchema,
  trimmed,
  uuidSchema,
} from './common';

export const liveBlogStatusSchema = z.enum(['draft', 'live', 'ended']);

export const liveBlogInputSchema = z.object({
  title: trimmed(200, 'Tittelen').min(1, 'Tittel må fylles ut'),
  slug: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
      z.union([slugSchema, z.literal('')]),
    )
    .default(''),
  description: nullableText(1000, 'Beskrivelsen').default(null),
  articleId: optionalUuidSchema.default(null),
  status: liveBlogStatusSchema.default('draft'),
  startedAt: nullableDate.default(null),
  endedAt: nullableDate.default(null),
});
export type LiveBlogInput = z.infer<typeof liveBlogInputSchema>;

export const livePostInputSchema = z
  .object({
    liveBlogId: uuidSchema,
    title: nullableText(200, 'Tittelen').default(null),
    body: contentDocSchema,
    authorId: optionalUuidSchema.default(null),
    isPinned: formBoolean.default(false),
    isKeyEvent: formBoolean.default(false),
    publishedAt: nullableDate.default(null),
  })
  .superRefine((v, ctx) => {
    if (isEmptyDoc(v.body) && !v.title) {
      ctx.addIssue({ code: 'custom', path: ['body'], message: 'Innlegget kan ikke være tomt' });
    }
  });
export type LivePostInput = z.infer<typeof livePostInputSchema>;

export const livePostUpdateSchema = z.object({
  id: uuidSchema,
  title: nullableText(200, 'Tittelen').optional(),
  body: contentDocSchema.optional(),
  authorId: optionalUuidSchema.optional(),
  isPinned: formBoolean.optional(),
  isKeyEvent: formBoolean.optional(),
});

/** Query for the public polling endpoint: /api/live/[id]/posts?after=<iso>&limit=n */
export const livePollQuerySchema = z.object({
  after: z
    .preprocess((v) => (v === '' || v === undefined ? null : v), z.union([z.null(), z.coerce.date()]))
    .default(null),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
