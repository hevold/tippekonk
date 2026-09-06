/**
 * Redirect rules that are pure (no database): status codes, path
 * normalisation, the input schemas and result types. Shared by the
 * settings UI (client) and the service in ./index.ts.
 */
import { z } from 'zod';

import type { Redirect } from '@/db/schema';

export const REDIRECT_STATUS_CODES = [301, 302, 307, 308] as const;
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];

export type ResolvedRedirect = { toPath: string; statusCode: RedirectStatusCode };

const MAX_PATH = 500;
export const MAX_CHAIN = 25;

/** Leading slash, no trailing slash, no query/hash, percent-decoded, no doubled slashes. */
export function normalizeRedirectPath(path: string): string {
  let p = (path ?? '').trim().split('?')[0]?.split('#')[0] ?? '/';
  if (!p.startsWith('/')) p = `/${p}`;
  try {
    p = decodeURIComponent(p);
  } catch {
    // Not valid percent-encoding: keep the raw value.
  }
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

export function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Normalise a target: site paths like fromPath, absolute URLs untouched (trimmed). */
export function normalizeRedirectTarget(value: string): string {
  const v = value.trim();
  if (isAbsoluteHttpUrl(v)) return v;
  return normalizeRedirectPath(v);
}

export const fromPathSchema = z
  .string()
  .trim()
  .min(1, 'Fra-sti må fylles ut')
  .max(MAX_PATH, `Maks ${MAX_PATH} tegn`)
  .refine((v) => v.startsWith('/'), 'Fra-sti må starte med /')
  .refine((v) => !/\s/.test(v), 'Fra-sti kan ikke inneholde mellomrom')
  .transform(normalizeRedirectPath)
  .refine((v) => v !== '/', 'Forsiden kan ikke omdirigeres')
  .refine((v) => !v.startsWith('/admin') && !v.startsWith('/api') && !v.startsWith('/media'), {
    error: 'Stier under /admin, /api og /media kan ikke omdirigeres',
  });

export const toPathSchema = z
  .string()
  .trim()
  .min(1, 'Til-sti må fylles ut')
  .max(2000, 'Maks 2000 tegn')
  .refine((v) => !/\s/.test(v), 'Til-sti kan ikke inneholde mellomrom')
  .refine((v) => v.startsWith('/') || isAbsoluteHttpUrl(v), {
    error: 'Til-sti må starte med / eller være en full adresse (https://…)',
  })
  .transform(normalizeRedirectTarget);

export const statusCodeSchema = z.coerce
  .number()
  .int()
  .refine((v): v is RedirectStatusCode => (REDIRECT_STATUS_CODES as readonly number[]).includes(v), {
    error: 'Statuskode må være 301, 302, 307 eller 308',
  });

export const redirectInputSchema = z
  .object({
    fromPath: fromPathSchema,
    toPath: toPathSchema,
    statusCode: statusCodeSchema.default(301),
  })
  .refine((v) => v.fromPath !== v.toPath, {
    error: 'Fra- og til-sti kan ikke være like',
    path: ['toPath'],
  });
export type RedirectInput = z.input<typeof redirectInputSchema>;
export type RedirectOutput = z.output<typeof redirectInputSchema>;

export const redirectListSchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['created', 'hits', 'from']).default('created'),
});
export type RedirectListQuery = z.input<typeof redirectListSchema>;

export type RedirectPage = { items: Redirect[]; total: number; page: number; perPage: number };

export type RedirectLookup = {
  matched: Redirect | null;
  /** The full chain the visitor would follow, first hop first (at most MAX_CHAIN). */
  chain: { fromPath: string; toPath: string; statusCode: number }[];
  finalPath: string;
  loops: boolean;
};

export type CsvRow = { line: number; fromPath: string; toPath: string; statusCode: RedirectStatusCode };
export type CsvIssue = { line: number; message: string };
export type ImportResult = { created: number; updated: number; issues: CsvIssue[] };
