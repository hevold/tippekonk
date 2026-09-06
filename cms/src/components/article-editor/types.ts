/**
 * Client-side form model for the article editor and the conversions to and
 * from the server's ArticleEditModel / ArticleInput. Pure: no React, no
 * server imports, so it can be unit-tested.
 */
import type { ArticleAccess, BylineRole } from '@/db/schema';
import type { ContentDoc } from '@/lib/content/types';
import type { ArticleInputRaw } from '@/lib/validation/article';
import type { ArticleEditModel } from '@/server/articles/queries';

/** Flag stored in `flags` once the slug has been edited by hand (mirrors the service). */
export const SLUG_LOCKED_FLAG = 'slugLocked';

export type EditorByline = { authorId: string; role: BylineRole };

export type EditorFormValues = {
  contentTypeId: string;
  title: string;
  kicker: string;
  lead: string;
  /** Stored slug; sent as '' (auto) unless `flags.slugLocked` is set. */
  slug: string;
  sectionId: string | null;
  access: ArticleAccess;
  body: ContentDoc;
  customFields: Record<string, unknown>;
  featuredMediaId: string | null;
  featuredCaption: string;
  featuredCredit: string;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  tagIds: string[];
  bylines: EditorByline[];
  relatedIds: string[];
  isBreaking: boolean;
  isSponsored: boolean;
  flags: Record<string, boolean>;
  assignedTo: string | null;
  deadlineAt: Date | null;
  plannedAt: Date | null;
};

export function formValuesFromModel(model: ArticleEditModel): EditorFormValues {
  const a = model.article;
  return {
    contentTypeId: a.contentTypeId,
    title: a.title ?? '',
    kicker: a.kicker ?? '',
    lead: a.lead ?? '',
    slug: a.slug,
    sectionId: a.sectionId,
    access: a.access,
    body: a.body,
    customFields: { ...(a.customFields ?? {}) },
    featuredMediaId: a.featuredMediaId,
    featuredCaption: a.featuredCaption ?? '',
    featuredCredit: a.featuredCredit ?? '',
    seoTitle: a.seoTitle ?? '',
    seoDescription: a.seoDescription ?? '',
    canonicalUrl: a.canonicalUrl ?? '',
    noIndex: a.noIndex,
    tagIds: [...model.tagIds],
    bylines: model.bylines.map((b) => ({ authorId: b.authorId, role: b.role })),
    relatedIds: model.related.map((r) => r.id),
    isBreaking: a.isBreaking,
    isSponsored: a.isSponsored,
    flags: { ...(a.flags ?? {}), ...(model.slugLocked ? { [SLUG_LOCKED_FLAG]: true } : {}) },
    assignedTo: a.assignedTo,
    deadlineAt: a.deadlineAt,
    plannedAt: a.plannedAt,
  };
}

/** Serialisable payload for saveArticle / the autosave route (dates as ISO strings). */
export function toArticleInput(values: EditorFormValues): ArticleInputRaw {
  const slugLocked = Boolean(values.flags[SLUG_LOCKED_FLAG]);
  return {
    contentTypeId: values.contentTypeId,
    title: values.title,
    kicker: values.kicker,
    lead: values.lead,
    slug: slugLocked ? values.slug : '',
    sectionId: values.sectionId,
    access: values.access,
    body: values.body,
    customFields: values.customFields,
    featuredMediaId: values.featuredMediaId,
    featuredCaption: values.featuredCaption,
    featuredCredit: values.featuredCredit,
    seoTitle: values.seoTitle,
    seoDescription: values.seoDescription,
    canonicalUrl: values.canonicalUrl,
    noIndex: values.noIndex,
    tagIds: values.tagIds,
    bylines: values.bylines,
    relatedIds: values.relatedIds,
    isBreaking: values.isBreaking,
    isSponsored: values.isSponsored,
    flags: values.flags,
    assignedTo: values.assignedTo,
    deadlineAt: values.deadlineAt ? values.deadlineAt.toISOString() : null,
    plannedAt: values.plannedAt ? values.plannedAt.toISOString() : null,
  };
}

/** Stable string used to detect unsaved changes. */
export function serializeForm(values: EditorFormValues): string {
  return JSON.stringify(toArticleInput(values));
}

export const BYLINE_ROLES: BylineRole[] = ['text', 'photo', 'video', 'graphics', 'other'];

export type SaveKind = 'autosave' | 'manual';

export type SaveOutcome =
  | { ok: true; version: number; savedAt: Date; slug: string }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]>; currentVersion?: number };

/** Norwegian labels for snapshot fields shown in the revision diff. */
const FIELD_LABELS: Record<string, string> = {
  kicker: 'Stikktittel',
  title: 'Tittel',
  lead: 'Ingress',
  slug: 'Slug',
  sectionId: 'Seksjon',
  access: 'Tilgang',
  featuredMediaId: 'Hovedbilde',
  featuredCaption: 'Bildetekst',
  featuredCredit: 'Fotokreditering',
  seoTitle: 'SEO-tittel',
  seoDescription: 'SEO-beskrivelse',
  isBreaking: 'Siste nytt',
  isSponsored: 'Annonsørinnhold',
  tagIds: 'Stikkord',
  bylines: 'Bylines',
  customFields: 'Egendefinerte felt',
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
