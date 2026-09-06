'use server';
/**
 * Article server actions — what the editor page, the versions page and the
 * pickers call. Each action resolves the signed-in context, validates its
 * input with Zod and delegates to the service (which enforces permissions,
 * the state machine, audit, notifications and cache revalidation). Results
 * are ActionResult values so the client can toast the Norwegian message.
 *
 * Autosave and lock heartbeats go through route handlers
 * (/api/articles/[id]/autosave and /lock) so they can return HTTP status
 * codes (409 on conflict) and be fired with `keepalive` on page unload.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import type { Article, ArticleNote, ArticleStatus } from '@/db/schema';
import { articleInputSchema, articleStatusSchema } from '@/lib/validation/article';
import { nullableDate, optionalUuidSchema, uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { acquireLock, releaseLock, type AcquireResult, type LockState, getLockState } from './locks';
import { searchArticlesForPicker, type PickerArticle } from './queries';
import type { SnapshotDiff } from './revisions';
import * as service from './service';
import { createTagQuick, listTags, type TagOption } from './taxonomy-lookup';
import type { PublishIssue } from './validation';

const idSchema = uuidSchema;

const saveSchema = z.object({
  id: uuidSchema,
  input: z.unknown(),
  expectedVersion: z.coerce.number().int().min(1),
  kind: z.enum(['autosave', 'manual']).default('manual'),
});

const transitionSchema = z.object({
  id: uuidSchema,
  to: articleStatusSchema,
  scheduledAt: nullableDate.optional(),
  note: z.string().trim().max(1000).optional(),
});

const scheduleSchema = z.object({ id: uuidSchema, at: z.coerce.date() });

const checklistSchema = z.object({ id: uuidSchema, itemId: z.string().min(1).max(100), checked: z.boolean() });

const noteSchema = z.object({ id: uuidSchema, body: z.string().trim().min(1, 'Skriv en melding').max(5000) });
const resolveNoteSchema = z.object({ id: uuidSchema, noteId: uuidSchema, resolved: z.boolean().default(true) });

const assignSchema = z.object({
  id: uuidSchema,
  assignedTo: optionalUuidSchema.default(null),
  deadlineAt: nullableDate.default(null),
  plannedAt: nullableDate.default(null),
});

const searchSchema = z.object({
  q: z.string().trim().max(200).default(''),
  excludeId: optionalUuidSchema.default(null),
  publishedOnly: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const restoreRevisionSchema = z.object({ id: uuidSchema, revisionId: uuidSchema });
const diffSchema = z.object({ id: uuidSchema, from: uuidSchema, to: uuidSchema });
const changeTypeSchema = z.object({ id: uuidSchema, contentTypeId: uuidSchema });
const lockSchema = z.object({ id: uuidSchema, takeover: z.boolean().default(false) });
const publishIssuesSchema = z.object({ id: uuidSchema, scheduledAt: nullableDate.optional() });

/* -------------------------------------------------------------------------- */
/*  Create / save                                                              */
/* -------------------------------------------------------------------------- */

export async function createArticleAction(input?: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:create');
    const partial = articleInputSchema.partial().parse(input ?? {});
    const article = await service.createArticle(ctx, partial);
    return { id: article.id };
  });
}

export async function saveArticleAction(
  id: string,
  input: unknown,
  expectedVersion: number,
  kind: 'autosave' | 'manual' = 'manual',
): Promise<ActionResult<{ version: number; savedAt: string; slug: string; article: Article }>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const parsed = saveSchema.parse({ id, input, expectedVersion, kind });
    const data = articleInputSchema.parse(parsed.input);
    const result = await service.saveArticle(ctx, parsed.id, data, {
      expectedVersion: parsed.expectedVersion,
      kind: parsed.kind,
    });
    return {
      version: result.version,
      savedAt: result.article.updatedAt.toISOString(),
      slug: result.article.slug,
      article: result.article,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Workflow                                                                   */
/* -------------------------------------------------------------------------- */

export async function transitionAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = transitionSchema.parse(input);
    const article = await service.transition(ctx, data.id, data.to as ArticleStatus, {
      scheduledAt: data.scheduledAt ?? null,
      note: data.note,
    });
    refresh();
    return article;
  });
}

export async function publishAction(id: string): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:publish');
    const article = await service.publishArticle(ctx, idSchema.parse(id));
    refresh();
    return article;
  });
}

export async function unpublishAction(id: string): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:publish');
    const article = await service.unpublishArticle(ctx, idSchema.parse(id));
    refresh();
    return article;
  });
}

export async function scheduleAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:publish');
    const data = scheduleSchema.parse(input);
    const article = await service.scheduleArticle(ctx, data.id, data.at);
    refresh();
    return article;
  });
}

export async function publishIssuesAction(input: unknown): Promise<ActionResult<PublishIssue[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = publishIssuesSchema.parse(input);
    return service.getPublishIssues(ctx, data.id, data.scheduledAt ?? null);
  });
}

/* -------------------------------------------------------------------------- */
/*  Trash / restore / destroy / duplicate / type                               */
/* -------------------------------------------------------------------------- */

export async function trashAction(id: string): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const article = await service.trashArticle(ctx, idSchema.parse(id));
    refresh();
    return article;
  });
}

export async function restoreAction(id: string): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:delete');
    const article = await service.restoreArticle(ctx, idSchema.parse(id));
    refresh();
    return article;
  });
}

export async function destroyAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:delete');
    await service.destroyArticle(ctx, idSchema.parse(id));
    refresh();
  });
}

export async function duplicateAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:create');
    const copy = await service.duplicateArticle(ctx, idSchema.parse(id));
    return { id: copy.id };
  });
}

export async function changeContentTypeAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = changeTypeSchema.parse(input);
    const article = await service.changeContentType(ctx, data.id, data.contentTypeId);
    refresh();
    return article;
  });
}

/* -------------------------------------------------------------------------- */
/*  Revisions                                                                  */
/* -------------------------------------------------------------------------- */

export async function restoreRevisionAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = restoreRevisionSchema.parse(input);
    const article = await service.restoreRevision(ctx, data.id, data.revisionId);
    refresh();
    return article;
  });
}

export async function diffRevisionsAction(
  input: unknown,
): Promise<ActionResult<{ from: { id: string; version: number }; to: { id: string; version: number }; diff: SnapshotDiff }>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = diffSchema.parse(input);
    return service.diffRevisions(ctx, data.id, data.from, data.to);
  });
}

/* -------------------------------------------------------------------------- */
/*  Checklist, notes, assignment                                               */
/* -------------------------------------------------------------------------- */

export async function toggleChecklistItemAction(input: unknown): Promise<ActionResult<Record<string, boolean>>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = checklistSchema.parse(input);
    const article = await service.toggleChecklistItem(ctx, data.id, data.itemId, data.checked);
    return article.flags ?? {};
  });
}

export async function addNoteAction(input: unknown): Promise<ActionResult<ArticleNote>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = noteSchema.parse(input);
    return service.addNote(ctx, data.id, data.body);
  });
}

export async function resolveNoteAction(input: unknown): Promise<ActionResult<ArticleNote>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = resolveNoteSchema.parse(input);
    return service.resolveNote(ctx, data.id, data.noteId, data.resolved);
  });
}

export async function assignAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = assignSchema.parse(input);
    return service.assignArticle(ctx, data.id, {
      assignedTo: data.assignedTo,
      deadlineAt: data.deadlineAt,
      plannedAt: data.plannedAt,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Locks                                                                      */
/* -------------------------------------------------------------------------- */

export async function acquireLockAction(input: unknown): Promise<ActionResult<AcquireResult & { state: LockState }>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = lockSchema.parse(input);
    const result = await acquireLock(ctx, data.id, { takeover: data.takeover });
    const state = await getLockState(ctx, data.id);
    return { ...result, state };
  });
}

export async function releaseLockAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    await releaseLock(ctx, idSchema.parse(id));
  });
}

/* -------------------------------------------------------------------------- */
/*  Pickers and taxonomy                                                       */
/* -------------------------------------------------------------------------- */

/** id/title/status for article pickers (related articles, custom fields of type 'article'). */
export async function searchArticlesForPickerAction(input: unknown): Promise<ActionResult<PickerArticle[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const data = searchSchema.parse(typeof input === 'string' ? { q: input } : (input ?? {}));
    return searchArticlesForPicker(ctx.site.id, data.q, {
      limit: data.limit,
      excludeId: data.excludeId ?? undefined,
      publishedOnly: data.publishedOnly,
    });
  });
}

export async function listTagsAction(): Promise<ActionResult<TagOption[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    return listTags(ctx.site.id);
  });
}

export async function createTagAction(name: unknown): Promise<ActionResult<TagOption>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:create');
    const tag = await createTagQuick(ctx, z.string().max(200).parse(name));
    return { id: tag.id, name: tag.name, slug: tag.slug };
  });
}
