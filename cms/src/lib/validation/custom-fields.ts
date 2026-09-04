/**
 * Dynamic validation of custom field values from a content type's FieldDefs.
 *
 *   const schema = customFieldValuesSchema(contentType.fields);
 *   const values = schema.parse(input.customFields);
 *
 * Values are keyed by field key. Unknown keys are dropped; missing optional
 * fields are omitted (or filled with the field's default); empty strings
 * count as missing so required checks behave like forms expect.
 */
import { z } from 'zod';

import { contentDocSchema } from '@/lib/content/schema';

import { emailSchema, urlSchema } from './common';
import type { FieldDef } from './site';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function baseSchema(field: FieldDef): z.ZodType<unknown> {
  const label = field.label;
  switch (field.type) {
    case 'text':
      return z
        .string()
        .trim()
        .max(field.max ?? 500, `${label} kan ikke være lengre enn ${field.max ?? 500} tegn`);
    case 'textarea':
      return z
        .string()
        .trim()
        .max(field.max ?? 5000, `${label} kan ikke være lengre enn ${field.max ?? 5000} tegn`);
    case 'richtext':
      return contentDocSchema;
    case 'number': {
      let n = z.coerce.number({ error: `${label} må være et tall` });
      if (typeof field.min === 'number') n = n.min(field.min, `${label} må være minst ${field.min}`);
      if (typeof field.max === 'number') n = n.max(field.max, `${label} kan ikke være mer enn ${field.max}`);
      return n;
    }
    case 'boolean':
      return z.preprocess((v) => {
        if (typeof v === 'string') return ['on', 'true', '1', 'ja'].includes(v.toLowerCase());
        return Boolean(v);
      }, z.boolean());
    case 'date':
      return z
        .string()
        .trim()
        .regex(DATE_ONLY, `${label} må være en dato (ÅÅÅÅ-MM-DD)`)
        .refine(
          (v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()),
          `${label} er ikke en gyldig dato`,
        );
    case 'datetime':
      return z.preprocess(
        (v) => (v instanceof Date ? v.toISOString() : v),
        z
          .string()
          .trim()
          .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} er ikke et gyldig tidspunkt`),
      );
    case 'select': {
      const values = (field.options ?? []).map((o) => o.value);
      return values.length
        ? z.string().refine((v) => values.includes(v), `${label}: ugyldig valg`)
        : z.string().trim().max(200);
    }
    case 'multiselect': {
      const values = (field.options ?? []).map((o) => o.value);
      const item = values.length
        ? z.string().refine((v) => values.includes(v), `${label}: ugyldig valg`)
        : z.string();
      return z.preprocess((v) => (typeof v === 'string' ? (v ? [v] : []) : v), z.array(item).max(100));
    }
    case 'media':
    case 'article':
      return z.uuid({ error: `${label}: ugyldig referanse` });
    case 'url':
      return urlSchema;
    case 'email':
      return emailSchema;
  }
}

/** Build a Zod object for the given field definitions. */
export function customFieldValuesSchema(fields: FieldDef[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const field of fields) {
    const inner = baseSchema(field);
    const withDefault =
      field.default !== undefined ? inner.optional().default(field.default) : inner.optional();
    shape[field.key] = z.preprocess((v) => {
      if (isBlank(v)) return undefined;
      return v;
    }, withDefault);
  }
  const object = z.object(shape);
  const refined = object.superRefine((values, ctx) => {
    for (const field of fields) {
      if (!field.required) continue;
      const v = values[field.key];
      const missing =
        isBlank(v) || (Array.isArray(v) && v.length === 0) || (field.type === 'boolean' && v !== true);
      if (missing) {
        ctx.addIssue({ code: 'custom', path: [field.key], message: `${field.label} må fylles ut` });
      }
    }
  });
  // Drop keys whose value is undefined so stored JSON stays sparse.
  return refined.transform((values) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) if (v !== undefined) out[k] = v;
    return out;
  }) as unknown as z.ZodType<Record<string, unknown>>;
}

/** Validate values leniently: returns cleaned values and per-field errors instead of throwing. */
export function validateCustomFields(
  fields: FieldDef[],
  input: unknown,
): { values: Record<string, unknown>; errors: Record<string, string> } {
  const result = customFieldValuesSchema(fields).safeParse(input && typeof input === 'object' ? input : {});
  if (result.success) return { values: result.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { values: {}, errors };
}
