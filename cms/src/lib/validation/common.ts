/**
 * Shared Zod building blocks: ids, slugs, colours, pagination, e-mail, URLs.
 * Error messages are bokmål because they surface directly in forms.
 */
import { z } from 'zod';

export const uuidSchema = z.uuid({ error: 'Ugyldig id' });

/** Optional uuid that also accepts '' and null from forms (normalised to null). */
export const optionalUuidSchema = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.union([uuidSchema, z.null()]),
);

export const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug må fylles ut')
  .max(80, 'Slug kan ikke være lengre enn 80 tegn')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug kan bare inneholde små bokstaver (a–z), tall og bindestrek');

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Ugyldig farge (bruk f.eks. #1d4ed8)');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'E-postadressen er for lang')
  .pipe(z.email({ error: 'Ugyldig e-postadresse' }));

/** Absolute http(s) URL. */
export const urlSchema = z
  .string()
  .trim()
  .max(2000, 'Adressen er for lang')
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Ugyldig nettadresse (må starte med http:// eller https://)');

/** Absolute http(s) URL or root-relative path ("/abonnement"). */
export const hrefSchema = z
  .string()
  .trim()
  .max(2000, 'Adressen er for lang')
  .refine((v) => {
    if (v.startsWith('/') && !v.startsWith('//')) return true;
    if (v.startsWith('#')) return true;
    try {
      const u = new URL(v);
      return (
        u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' || u.protocol === 'tel:'
      );
    } catch {
      return false;
    }
  }, 'Ugyldig lenke');

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Trimmed string with max length; '' allowed. */
export const trimmed = (max: number, label = 'Feltet') =>
  z.string().trim().max(max, `${label} kan ikke være lengre enn ${max} tegn`);

/** Trimmed, optional string where '' and undefined become null (for nullable text columns). */
export const nullableText = (max: number, label = 'Feltet') =>
  z.preprocess(
    (v) => (v === undefined || v === null ? null : typeof v === 'string' && v.trim() === '' ? null : v),
    z.union([trimmed(max, label), z.null()]),
  );

/** Checkbox values from FormData ('on', 'true', '1') and booleans → boolean. */
export const formBoolean = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'string') return ['on', 'true', '1', 'ja'].includes(v.toLowerCase());
  return Boolean(v);
}, z.boolean());

/** ISO string / Date / '' → Date | null. */
export const nullableDate = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (v instanceof Date) return v;
    if (typeof v === 'string' || typeof v === 'number') {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? v : d;
    }
    return v;
  },
  z.union([z.date({ error: 'Ugyldig dato' }), z.null()]),
);

/** Sort spec "field" or "-field" from search params. */
export const sortSchema = (fields: readonly string[]) =>
  z
    .string()
    .trim()
    .regex(/^-?[a-zA-Z]+$/)
    .refine((v) => fields.includes(v.replace(/^-/, '')), 'Ugyldig sortering')
    .transform((v) => ({
      field: v.replace(/^-/, ''),
      direction: v.startsWith('-') ? ('desc' as const) : ('asc' as const),
    }));

/** Turn a ZodError into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
