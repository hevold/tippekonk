/**
 * Settings sections and their Zod schemas. Pure module (no 'server-only')
 * because the same schemas drive the react-hook-form resolvers in the
 * settings forms and the server-side validation in the actions.
 *
 * A "section" is what one settings page saves in one go:
 *   general    → columns on the `sites` row (name, tagline, domains, locale, timezone, isActive)
 *   editorial  → settings.editorial + contact + social + editor + reading + frontPage + feeds + live
 *   theme      → settings.theme + masthead
 *   checklist  → settings.checklist
 *   paywall    → settings.paywall
 *   seo        → settings.seo
 *   analytics  → settings.analytics
 */
import { z } from 'zod';

import { siteSettingsSchema, type SiteSettings } from '@/lib/validation/site';

export const SETTINGS_SECTIONS = [
  'general',
  'editorial',
  'theme',
  'checklist',
  'paywall',
  'seo',
  'analytics',
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const settingsSectionSchema = z.enum(SETTINGS_SECTIONS);

export type SettingsKey = keyof SiteSettings;

/** Which top-level keys of `sites.settings` each section may write. */
export const SECTION_KEYS: Record<SettingsSection, readonly SettingsKey[]> = {
  general: [],
  editorial: ['editorial', 'contact', 'social', 'editor', 'reading', 'frontPage', 'feeds', 'live'],
  theme: ['theme', 'masthead'],
  checklist: ['checklist'],
  paywall: ['paywall'],
  seo: ['seo'],
  analytics: ['analytics'],
};

/* -------------------------------------------------------------------------- */
/*  Section schemas (inner objects without the `.prefault({})` wrapper)        */
/* -------------------------------------------------------------------------- */

const shape = siteSettingsSchema.shape;

export const themeSchema = shape.theme.unwrap();
export const mastheadSchema = shape.masthead.unwrap();
export const contactSchema = shape.contact.unwrap();
export const editorialSchema = shape.editorial.unwrap();
export const socialSchema = shape.social.unwrap();
export const paywallSchema = shape.paywall.unwrap();
export const checklistSchema = shape.checklist.unwrap();
export const seoSchema = shape.seo.unwrap();
export const readingSchema = shape.reading.unwrap();
export const analyticsSchema = shape.analytics.unwrap();
export const frontPageSchema = shape.frontPage.unwrap();
export const feedsSchema = shape.feeds.unwrap();
export const liveSchema = shape.live.unwrap();
export const editorSchema = shape.editor.unwrap();

/** Optional media id from a form: '' and null clear the value. */
const optionalMediaId = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.uuid({ error: 'Ugyldig bilde' }).optional(),
);

export const themeSectionSchema = z.object({
  theme: themeSchema.extend({ logoMediaId: optionalMediaId }),
  masthead: mastheadSchema,
});
export type ThemeSectionInput = z.input<typeof themeSectionSchema>;
export type ThemeSectionOutput = z.output<typeof themeSectionSchema>;

export const editorialSectionSchema = z.object({
  editorial: editorialSchema,
  contact: contactSchema,
  social: socialSchema,
  editor: editorSchema,
  reading: readingSchema,
  frontPage: frontPageSchema,
  feeds: feedsSchema,
  live: liveSchema,
});
export type EditorialSectionInput = z.input<typeof editorialSectionSchema>;
export type EditorialSectionOutput = z.output<typeof editorialSectionSchema>;

export const checklistSectionSchema = z.object({
  checklist: z.object({
    enabled: z.boolean(),
    items: z
      .array(
        z.object({
          id: z.string().min(1, 'Mangler id'),
          label: z.string().trim().min(1, 'Punktet må ha en tekst').max(300, 'Maks 300 tegn'),
          required: z.boolean(),
          vvpRef: z
            .string()
            .trim()
            .max(20, 'Maks 20 tegn')
            .regex(/^(\d{1,2}(\.\d{1,2})?)?$/, 'Bruk formatet 4.14')
            .optional(),
          help: z.string().trim().max(500, 'Maks 500 tegn').optional(),
        }),
      )
      .max(50, 'Maks 50 punkter')
      .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
        error: 'Punktene må ha unike id-er',
      }),
  }),
});
export type ChecklistSectionInput = z.input<typeof checklistSectionSchema>;
export type ChecklistSectionOutput = z.output<typeof checklistSectionSchema>;

export const paywallSectionSchema = z.object({ paywall: paywallSchema });
export type PaywallSectionInput = z.input<typeof paywallSectionSchema>;
export type PaywallSectionOutput = z.output<typeof paywallSectionSchema>;

export const seoSectionSchema = z.object({
  seo: seoSchema.extend({ ogImageMediaId: optionalMediaId }),
});
export type SeoSectionInput = z.input<typeof seoSectionSchema>;
export type SeoSectionOutput = z.output<typeof seoSectionSchema>;

/** '' or an https:// URL — analytics scripts are loaded on every public page, so no http/javascript/data. */
const httpsUrlOrEmpty = z
  .string()
  .trim()
  .max(500, 'Adressen er for lang')
  .refine((v) => {
    if (!v) return true;
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Må være en https-adresse');

/** '' or a bare hostname such as "avisa.no" (no scheme, path or quotes). */
const hostnameOrEmpty = z
  .string()
  .trim()
  .max(253, 'Domenet er for langt')
  .refine(
    (v) => !v || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v),
    'Skriv bare domenet, f.eks. avisa.no',
  );

const idOrEmpty = z
  .string()
  .trim()
  .max(120, 'Verdien er for lang')
  .refine((v) => /^[A-Za-z0-9_-]*$/.test(v), 'Bare bokstaver, tall, bindestrek og understrek');

export const analyticsSectionSchema = z.object({
  analytics: analyticsSchema.extend({
    plausibleDomain: hostnameOrEmpty,
    umamiScriptUrl: httpsUrlOrEmpty,
    umamiWebsiteId: idOrEmpty,
    matomoUrl: httpsUrlOrEmpty,
    matomoSiteId: idOrEmpty,
  }),
});
export type AnalyticsSectionInput = z.input<typeof analyticsSectionSchema>;
export type AnalyticsSectionOutput = z.output<typeof analyticsSectionSchema>;

/* -------------------------------------------------------------------------- */
/*  General (the `sites` row)                                                  */
/* -------------------------------------------------------------------------- */

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/**
 * Normalise what people paste as a domain: strip protocol, path, port and
 * whitespace, lower-case. Returns '' for empty input.
 */
export function normalizeDomain(raw: string): string {
  let v = raw.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  v = v.split('/')[0] ?? '';
  v = v.split('?')[0] ?? '';
  if (!v.startsWith('[')) v = v.split(':')[0] ?? '';
  v = v.replace(/\.+$/, '');
  return v;
}

export function isValidDomain(value: string): boolean {
  return value === 'localhost' || IPV4_RE.test(value) || HOSTNAME_RE.test(value);
}

export const domainSchema = z
  .string()
  .transform(normalizeDomain)
  .pipe(z.string().min(1, 'Domenet kan ikke være tomt').refine(isValidDomain, 'Ugyldig domenenavn'));

export const SITE_LOCALES = ['nb', 'nn'] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const TIMEZONES = [
  'Europe/Oslo',
  'Europe/Stockholm',
  'Europe/Copenhagen',
  'Europe/Helsinki',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
] as const;

export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('nb-NO', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const siteGeneralSchema = z.object({
  name: z.string().trim().min(1, 'Navn må fylles ut').max(120, 'Maks 120 tegn'),
  tagline: z.string().trim().max(200, 'Maks 200 tegn'),
  domains: z
    .array(domainSchema)
    .max(20, 'Maks 20 domener')
    .transform((list) => [...new Set(list)]),
  locale: z.enum(SITE_LOCALES, { error: 'Velg språk' }),
  timezone: z.string().trim().refine(isValidTimezone, 'Ukjent tidssone'),
  isActive: z.boolean(),
});
export type SiteGeneralInput = z.input<typeof siteGeneralSchema>;
export type SiteGeneralOutput = z.output<typeof siteGeneralSchema>;

/** Loose shape of a section payload; the merged result is what gets validated. */
export const sectionPayloadSchema = z.record(z.string(), z.unknown());
