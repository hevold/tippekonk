/**
 * Sections, tags, authors and content types: input schemas for the newsroom
 * admin forms and their server actions.
 */
import { z } from 'zod';

import { isReservedSlug } from '@/config/routes';

import {
  emailSchema,
  formBoolean,
  hexColorSchema,
  nullableText,
  optionalUuidSchema,
  slugSchema,
  trimmed,
} from './common';
import { fieldDefSchema } from './site';

/** Optional slug: '' means "generate from the name". */
const optionalSlug = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.union([slugSchema, z.literal('')]),
);

const optionalColor = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.union([hexColorSchema, z.null()]),
);

export const sectionInputSchema = z.object({
  name: trimmed(80, 'Navnet').min(1, 'Navn må fylles ut'),
  slug: optionalSlug.default('').refine((v) => !v || !isReservedSlug(v), 'Denne adressen er reservert'),
  parentId: optionalUuidSchema.default(null),
  description: nullableText(1000, 'Beskrivelsen').default(null),
  color: optionalColor.default(null),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  showInMenu: formBoolean.default(true),
  isActive: formBoolean.default(true),
  seoTitle: nullableText(120, 'SEO-tittelen').default(null),
  seoDescription: nullableText(320, 'SEO-beskrivelsen').default(null),
});
export type SectionInput = z.infer<typeof sectionInputSchema>;

export const tagInputSchema = z.object({
  name: trimmed(80, 'Navnet').min(1, 'Navn må fylles ut'),
  slug: optionalSlug.default(''),
  description: nullableText(1000, 'Beskrivelsen').default(null),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export const authorInputSchema = z.object({
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  slug: optionalSlug.default(''),
  userId: optionalUuidSchema.default(null),
  title: nullableText(120, 'Tittelen').default(null),
  bio: nullableText(3000, 'Biografien').default(null),
  email: z
    .preprocess((v) => (v === '' || v === undefined ? null : v), z.union([emailSchema, z.null()]))
    .default(null),
  phone: nullableText(40, 'Telefonnummeret').default(null),
  imageMediaId: optionalUuidSchema.default(null),
  isActive: formBoolean.default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type AuthorInput = z.infer<typeof authorInputSchema>;

export const CONTENT_TYPE_TEMPLATES = ['article', 'opinion', 'notice', 'longread'] as const;
export const contentTypeTemplateSchema = z.enum(CONTENT_TYPE_TEMPLATES);

export const contentTypeKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Nøkkel må fylles ut')
  .max(40, 'Nøkkelen kan ikke være lengre enn 40 tegn')
  .regex(/^[a-z][a-z0-9_-]*$/, 'Nøkkelen må starte med en bokstav og kan bare inneholde a–z, tall, - og _');

export const contentTypeInputSchema = z.object({
  key: contentTypeKeySchema,
  name: trimmed(80, 'Navnet').min(1, 'Navn må fylles ut'),
  description: nullableText(500, 'Beskrivelsen').default(null),
  icon: nullableText(60, 'Ikonet').default(null),
  template: contentTypeTemplateSchema.default('article'),
  fields: z
    .array(fieldDefSchema)
    .max(50, 'Maks 50 felt')
    .default([])
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      fields.forEach((f, i) => {
        if (seen.has(f.key)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'key'],
            message: `Nøkkelen «${f.key}» er brukt flere ganger`,
          });
        }
        seen.add(f.key);
        if ((f.type === 'select' || f.type === 'multiselect') && (!f.options || f.options.length === 0)) {
          ctx.addIssue({
            code: 'custom',
            path: [i, 'options'],
            message: 'Valgfelt må ha minst ett alternativ',
          });
        }
      });
    }),
  isDefault: formBoolean.default(false),
  isActive: formBoolean.default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type ContentTypeInput = z.infer<typeof contentTypeInputSchema>;

/** Reorder payload for sections/authors drag-and-drop. */
export const reorderSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});
