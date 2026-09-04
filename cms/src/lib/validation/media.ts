/**
 * Media metadata schemas (edit dialog and upload form fields).
 */
import { z } from 'zod';

import { formBoolean, nullableText, paginationSchema, uuidSchema } from './common';

export const mediaKindSchema = z.enum(['image', 'video', 'audio', 'document']);

const focal = z.coerce.number().min(0).max(1);

export const mediaTagsSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',') : v),
  z
    .array(z.string().trim().min(1).max(50))
    .max(50, 'Maks 50 stikkord')
    .transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))]),
);

export const mediaMetaSchema = z.object({
  alt: nullableText(1000, 'Alternativ tekst').default(null),
  caption: nullableText(2000, 'Bildeteksten').default(null),
  credit: nullableText(300, 'Fotokrediteringen').default(null),
  license: nullableText(200, 'Lisensen').default(null),
  sourceUrl: nullableText(2000, 'Kilden').default(null),
  focalX: focal.default(0.5),
  focalY: focal.default(0.5),
  folder: nullableText(120, 'Mappen').default(null),
  tags: mediaTagsSchema.default([]),
  takenAt: z
    .preprocess((v) => (v === '' || v === undefined ? null : v), z.union([z.null(), z.coerce.date()]))
    .default(null),
});
export type MediaMetaInput = z.infer<typeof mediaMetaSchema>;

export const mediaUpdateSchema = mediaMetaSchema.partial().extend({ id: uuidSchema });

export const mediaFilterSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.preprocess((v) => (v === '' ? undefined : v), mediaKindSchema.optional()),
  folder: z.string().trim().max(120).optional(),
  trashed: formBoolean.default(false),
  page: paginationSchema.shape.page,
  perPage: z.coerce.number().int().min(1).max(200).default(40),
});
export type MediaFilter = z.infer<typeof mediaFilterSchema>;

export const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'application/pdf',
] as const;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const uploadFieldsSchema = z.object({
  alt: nullableText(1000, 'Alternativ tekst').default(null),
  caption: nullableText(2000, 'Bildeteksten').default(null),
  credit: nullableText(300, 'Fotokrediteringen').default(null),
  folder: nullableText(120, 'Mappen').default(null),
});
