/**
 * Publish validation (SPEC 5.4) and the workflow state machine (SPEC 5.2).
 *
 * Pure module: no database, no Next.js, so the editor page can run the same
 * checks in the browser for a live "kan publiseres?" preview, and the
 * service runs them server-side with the real media rows before publishing.
 *
 *   validateForPublish(article, settings, media)  → PublishIssue[]   (errors block, warnings allowed)
 *   allowedTransitions('draft')                   → ['in_review', 'approved', ...]
 *   canTransition(from, to)
 */
import type { ArticleStatus, Media } from '@/db/schema';
import { docMediaIds, walkDoc } from '@/lib/content/text';
import type { ContentDoc } from '@/lib/content/types';
import { validateCustomFields } from '@/lib/validation/custom-fields';
import type { FieldDef, SiteSettings } from '@/lib/validation/site';

export type PublishIssueLevel = 'error' | 'warning';

export type PublishIssue = {
  level: PublishIssueLevel;
  /** Field the issue belongs to (title, lead, sectionId, bylines, featuredMediaId, body, checklist, scheduledAt, customFields.<key>). */
  field?: string;
  message: string;
};

/** The subset of an article the publish rules look at. Plain objects from the client form qualify too. */
export type PublishCandidate = {
  title: string;
  lead: string | null;
  sectionId: string | null;
  body: ContentDoc;
  featuredMediaId: string | null;
  featuredCredit?: string | null;
  bylines: { authorId: string }[];
  isSponsored: boolean;
  flags: Record<string, boolean>;
  scheduledAt?: Date | null;
  customFields?: Record<string, unknown>;
};

/** Minimal media shape needed by the rules (the full Media row satisfies it). */
export type PublishMedia = Pick<Media, 'id' | 'alt' | 'credit'>;

export const CHECKLIST_FLAG_PREFIX = 'checklist:';

export function checklistFlag(itemId: string): string {
  return `${CHECKLIST_FLAG_PREFIX}${itemId}`;
}

export function isChecklistItemDone(
  flags: Record<string, boolean> | null | undefined,
  itemId: string,
): boolean {
  return Boolean(flags?.[checklistFlag(itemId)]);
}

type BodyImage = { mediaId: string; alt: string; credit: string };

/** Every image in the body with the alt/credit the document carries (node attrs), including gallery items. */
export function bodyImages(doc: ContentDoc): BodyImage[] {
  const out: BodyImage[] = [];
  walkDoc(doc, (node) => {
    if (node.type === 'image') {
      const mediaId = typeof node.attrs?.mediaId === 'string' ? node.attrs.mediaId : '';
      if (!mediaId) return;
      out.push({
        mediaId,
        alt: typeof node.attrs?.alt === 'string' ? node.attrs.alt : '',
        credit: typeof node.attrs?.credit === 'string' ? node.attrs.credit : '',
      });
    } else if (node.type === 'gallery') {
      const items = node.attrs?.items;
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const it = item as { mediaId?: unknown; alt?: unknown; credit?: unknown };
        if (typeof it.mediaId !== 'string' || !it.mediaId) continue;
        out.push({
          mediaId: it.mediaId,
          alt: typeof it.alt === 'string' ? it.alt : '',
          credit: typeof it.credit === 'string' ? it.credit : '',
        });
      }
    }
  });
  return out;
}

function hasText(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validate an article for publishing. `media` holds the rows for the
 * featured image and every image referenced by the body (missing rows count
 * as "image deleted" errors). `fields` are the content type's custom field
 * definitions; when given, required custom fields are enforced as errors.
 */
export function validateForPublish(
  article: PublishCandidate,
  settings: SiteSettings,
  media: Map<string, PublishMedia>,
  fields: FieldDef[] = [],
  now: Date = new Date(),
): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const editor = settings.editor;

  const title = article.title.trim();
  if (!title) {
    issues.push({ level: 'error', field: 'title', message: 'Saken må ha en tittel.' });
  } else if (Array.from(title).length > editor.titleMaxLength) {
    issues.push({
      level: 'warning',
      field: 'title',
      message: `Tittelen er lengre enn ${editor.titleMaxLength} tegn og kan bli kuttet på forsiden.`,
    });
  }

  if (editor.requireLead && !hasText(article.lead)) {
    issues.push({ level: 'error', field: 'lead', message: 'Saken må ha en ingress.' });
  } else if (hasText(article.lead) && Array.from(article.lead!.trim()).length > editor.leadMaxLength) {
    issues.push({
      level: 'warning',
      field: 'lead',
      message: `Ingressen er lengre enn ${editor.leadMaxLength} tegn.`,
    });
  }

  if (!article.sectionId) {
    issues.push({ level: 'error', field: 'sectionId', message: 'Saken må plasseres i en seksjon.' });
  }

  if (article.bylines.length === 0) {
    issues.push({ level: 'error', field: 'bylines', message: 'Saken må ha minst én byline.' });
  }

  if (editor.requireFeaturedImage && !article.featuredMediaId) {
    issues.push({ level: 'error', field: 'featuredMediaId', message: 'Saken må ha et hovedbilde.' });
  }

  if (article.featuredMediaId) {
    const featured = media.get(article.featuredMediaId);
    if (!featured) {
      issues.push({
        level: 'error',
        field: 'featuredMediaId',
        message: 'Hovedbildet finnes ikke lenger i mediearkivet. Velg et annet bilde.',
      });
    } else {
      if (!hasText(featured.alt)) {
        issues.push({
          level: 'error',
          field: 'featuredMediaId',
          message: 'Hovedbildet mangler alternativ tekst (alt-tekst).',
        });
      }
      if (!hasText(featured.credit) && !hasText(article.featuredCredit)) {
        issues.push({
          level: 'warning',
          field: 'featuredMediaId',
          message: 'Hovedbildet mangler fotokreditering.',
        });
      }
    }
  }

  const images = bodyImages(article.body);
  const seen = new Set<string>();
  let missingAlt = 0;
  let missingCredit = 0;
  let deleted = 0;
  for (const image of images) {
    if (seen.has(image.mediaId)) continue;
    seen.add(image.mediaId);
    const row = media.get(image.mediaId);
    if (!row) {
      deleted += 1;
      continue;
    }
    if (!hasText(image.alt) && !hasText(row.alt)) missingAlt += 1;
    if (!hasText(image.credit) && !hasText(row.credit)) missingCredit += 1;
  }
  // Ids in the doc that the caller could not resolve at all (e.g. removed from the archive).
  for (const id of docMediaIds(article.body)) {
    if (!seen.has(id) && !media.has(id)) deleted += 1;
  }
  if (deleted > 0) {
    issues.push({
      level: 'error',
      field: 'body',
      message:
        deleted === 1
          ? 'Ett bilde i brødteksten finnes ikke lenger i mediearkivet.'
          : `${deleted} bilder i brødteksten finnes ikke lenger i mediearkivet.`,
    });
  }
  if (missingAlt > 0) {
    issues.push({
      level: 'error',
      field: 'body',
      message:
        missingAlt === 1
          ? 'Ett bilde i brødteksten mangler alternativ tekst.'
          : `${missingAlt} bilder i brødteksten mangler alternativ tekst.`,
    });
  }
  if (missingCredit > 0) {
    issues.push({
      level: 'warning',
      field: 'body',
      message:
        missingCredit === 1
          ? 'Ett bilde i brødteksten mangler fotokreditering.'
          : `${missingCredit} bilder i brødteksten mangler fotokreditering.`,
    });
  }

  if (article.isSponsored) {
    issues.push({
      level: 'warning',
      field: 'isSponsored',
      message: 'Saken er merket som annonsørinnhold og vises med «Annonsørinnhold»-merke.',
    });
  }

  if (settings.checklist.enabled) {
    for (const item of settings.checklist.items) {
      if (!item.required) continue;
      if (!isChecklistItemDone(article.flags, item.id)) {
        issues.push({
          level: 'error',
          field: `checklist.${item.id}`,
          message: `Sjekkliste: «${item.label}» må hakes av.`,
        });
      }
    }
  }

  if (article.scheduledAt && article.scheduledAt.getTime() <= now.getTime()) {
    issues.push({
      level: 'error',
      field: 'scheduledAt',
      message: 'Publiseringstidspunktet må være fram i tid.',
    });
  }

  if (fields.length > 0) {
    const { errors } = validateCustomFields(fields, article.customFields ?? {});
    for (const [key, message] of Object.entries(errors)) {
      issues.push({ level: 'error', field: `customFields.${key}`, message });
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: PublishIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}

/** Map issues onto the ActionResult fieldErrors shape. */
export function issuesToFieldErrors(issues: PublishIssue[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) {
    if (issue.level !== 'error') continue;
    const key = issue.field ?? '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Workflow state machine (SPEC 5.2)                                          */
/* -------------------------------------------------------------------------- */

/**
 * Allowed target statuses per current status. Publishing from any pre-publish
 * state is allowed for editors (the desk often publishes a draft directly);
 * the review chain is the recommended path, not a hard requirement.
 */
export const TRANSITIONS: Record<ArticleStatus, readonly ArticleStatus[]> = {
  draft: ['in_review', 'approved', 'scheduled', 'published', 'archived'],
  in_review: ['draft', 'approved', 'scheduled', 'published', 'archived'],
  approved: ['draft', 'in_review', 'scheduled', 'published', 'archived'],
  scheduled: ['draft', 'approved', 'published', 'archived'],
  published: ['unpublished'],
  unpublished: ['draft', 'published', 'archived'],
  archived: ['draft'],
};

export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: ArticleStatus): ArticleStatus[] {
  return [...TRANSITIONS[from]];
}

/** Statuses that count as "trashable" — published articles must be unpublished first. */
export function canTrash(status: ArticleStatus): boolean {
  return status !== 'published';
}
