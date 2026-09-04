/**
 * Site settings, custom field definitions and menu items — Zod schemas and
 * inferred types. `siteSettingsSchema.parse({})` yields a complete default
 * configuration, so `sites.settings` may be stored sparsely.
 */
import { z } from 'zod';

const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Ugyldig farge');

export const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Required items block publishing until ticked. */
  required: z.boolean().default(false),
  /** Reference to Vær Varsom-plakaten, e.g. "4.14". */
  vvpRef: z.string().optional(),
  help: z.string().optional(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: 'sources',
    label: 'Kildene er kontrollert og opplysningene er verifisert',
    required: true,
    vvpRef: '3.2',
  },
  {
    id: 'rebuttal',
    label: 'Den som utsettes for sterke beskyldninger har fått mulighet til samtidig imøtegåelse',
    required: true,
    vvpRef: '4.14',
  },
  {
    id: 'title',
    label: 'Tittel og ingress har dekning i saken',
    required: true,
    vvpRef: '4.4',
  },
  {
    id: 'images',
    label: 'Bilder er kreditert og har alternativ tekst',
    required: true,
    vvpRef: '4.10',
  },
  {
    id: 'children',
    label: 'Barn som er omtalt eller avbildet er ivaretatt',
    required: false,
    vvpRef: '4.8',
  },
  {
    id: 'sponsored',
    label: 'Kommersielt innhold er tydelig merket',
    required: false,
    vvpRef: '2.6',
  },
];

export const siteSettingsSchema = z.object({
  theme: z
    .object({
      primary: hexColor.default('#0b3d91'),
      accent: hexColor.default('#d9291c'),
      background: hexColor.default('#ffffff'),
      text: hexColor.default('#111111'),
      fontHeading: z.enum(['serif', 'sans']).default('serif'),
      fontBody: z.enum(['serif', 'sans']).default('sans'),
      radius: z.enum(['none', 'sm', 'md', 'lg']).default('sm'),
      logoMediaId: z.string().uuid().optional(),
      /** Public site colour scheme. */
      darkMode: z.enum(['auto', 'off']).default('off'),
      /** Max content width in px. */
      contentWidth: z.number().int().min(960).max(1600).default(1200),
    })
    .prefault({}),
  masthead: z
    .object({
      showTagline: z.boolean().default(true),
      showDate: z.boolean().default(true),
      showWeather: z.boolean().default(false),
    })
    .prefault({}),
  contact: z
    .object({
      address: z.string().default(''),
      postalCode: z.string().default(''),
      city: z.string().default(''),
      email: z.string().default(''),
      phone: z.string().default(''),
      tipsEmail: z.string().default(''),
      tipsPhone: z.string().default(''),
      /** Krypterte tips, e.g. Signal number or SecureDrop URL. */
      secureTipsUrl: z.string().default(''),
    })
    .prefault({}),
  editorial: z
    .object({
      /** Ansvarlig redaktør — required by Norwegian press practice. */
      responsibleEditor: z.string().default(''),
      responsibleEditorTitle: z.string().default('Ansvarlig redaktør'),
      /** Utgiver. */
      publisher: z.string().default(''),
      orgNumber: z.string().default(''),
      /** Show the standard PFU/VVP footer statement. */
      showPressEthicsStatement: z.boolean().default(true),
      pressEthicsStatement: z
        .string()
        .default(
          'Avisen arbeider etter Vær Varsom-plakatens regler for god presseskikk. Den som mener seg rammet av urettmessig publisering, oppfordres til å ta kontakt med redaksjonen. Pressens Faglige Utvalg (PFU) er et klageorgan oppnevnt av Norsk Presseforbund.',
        ),
      editorialPolicyUrl: z.string().default(''),
    })
    .prefault({}),
  social: z
    .object({
      facebook: z.string().default(''),
      instagram: z.string().default(''),
      x: z.string().default(''),
      youtube: z.string().default(''),
      tiktok: z.string().default(''),
      bluesky: z.string().default(''),
    })
    .prefault({}),
  paywall: z
    .object({
      enabled: z.boolean().default(false),
      label: z.string().default('Pluss'),
      /** Paragraphs shown before the teaser cut. */
      teaserParagraphs: z.number().int().min(0).max(10).default(2),
      ctaTitle: z.string().default('Vil du lese videre?'),
      ctaText: z.string().default('Bli abonnent og få tilgang til alt innhold.'),
      ctaButton: z.string().default('Bli abonnent'),
      ctaUrl: z.string().default('/abonnement'),
      loginUrl: z.string().default(''),
    })
    .prefault({}),
  checklist: z
    .object({
      enabled: z.boolean().default(true),
      items: z.array(checklistItemSchema).default(DEFAULT_CHECKLIST),
    })
    .prefault({}),
  seo: z
    .object({
      titleSuffix: z.string().default(''),
      defaultDescription: z.string().default(''),
      ogImageMediaId: z.string().uuid().optional(),
      twitterHandle: z.string().default(''),
    })
    .prefault({}),
  reading: z
    .object({
      showReadingTime: z.boolean().default(true),
      showUpdatedAt: z.boolean().default(true),
      showWordCount: z.boolean().default(false),
    })
    .prefault({}),
  analytics: z
    .object({
      plausibleDomain: z.string().default(''),
      umamiScriptUrl: z.string().default(''),
      umamiWebsiteId: z.string().default(''),
      matomoUrl: z.string().default(''),
      matomoSiteId: z.string().default(''),
    })
    .prefault({}),
  frontPage: z
    .object({
      breakingBar: z.boolean().default(true),
      latestCount: z.number().int().min(0).max(50).default(10),
    })
    .prefault({}),
  feeds: z
    .object({
      fullContent: z.boolean().default(false),
      itemCount: z.number().int().min(1).max(100).default(30),
    })
    .prefault({}),
  live: z
    .object({
      pollIntervalSec: z.number().int().min(5).max(300).default(20),
    })
    .prefault({}),
  editor: z
    .object({
      /** Require a featured image before publishing. */
      requireFeaturedImage: z.boolean().default(false),
      requireLead: z.boolean().default(true),
      /** Warn when the title exceeds this many characters. */
      titleMaxLength: z.number().int().min(20).max(200).default(90),
      leadMaxLength: z.number().int().min(50).max(600).default(300),
      autosaveIntervalSec: z.number().int().min(5).max(120).default(15),
    })
    .prefault({}),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

/** Parse possibly-sparse stored settings into a complete object. Never throws. */
export function parseSiteSettings(raw: unknown): SiteSettings {
  const result = siteSettingsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  return siteSettingsSchema.parse({});
}

/* -------------------------------------------------------------------------- */
/*  Custom fields for content types                                            */
/* -------------------------------------------------------------------------- */

export const fieldTypeSchema = z.enum([
  'text',
  'textarea',
  'richtext',
  'number',
  'boolean',
  'date',
  'datetime',
  'select',
  'multiselect',
  'media',
  'article',
  'url',
  'email',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const fieldDefSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Nøkkel må være små bokstaver, tall og understrek'),
  label: z.string().min(1).max(120),
  type: fieldTypeSchema,
  required: z.boolean().default(false),
  help: z.string().max(500).optional(),
  placeholder: z.string().max(200).optional(),
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .optional(),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Show in the article list as a column. */
  showInList: z.boolean().default(false),
});
export type FieldDef = z.infer<typeof fieldDefSchema>;

/* -------------------------------------------------------------------------- */
/*  Menus                                                                      */
/* -------------------------------------------------------------------------- */

export type MenuItem = {
  id: string;
  label: string;
  href: string;
  target?: '_blank';
  children?: MenuItem[];
};

export const menuItemSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1).max(80),
    href: z.string().min(1).max(500),
    target: z.literal('_blank').optional(),
    children: z.array(menuItemSchema).optional(),
  }),
);
