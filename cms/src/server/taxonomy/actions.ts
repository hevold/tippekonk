'use server';
/**
 * Taxonomy server actions (sections, tags, authors) called from the admin
 * pages /admin/seksjoner, /admin/stikkord and /admin/skribenter. Each one
 * resolves the signed-in context with `requirePermission('taxonomy:manage')`,
 * validates its input and delegates to ./service.ts, which audits and
 * revalidates. `refresh()` re-renders the server page behind the dialog.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import type { Author, Section, Tag } from '@/db/schema';
import { optionalUuidSchema, uuidSchema } from '@/lib/validation/common';
import { reorderSchema } from '@/lib/validation/taxonomy';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import * as service from './service';

const idSchema = uuidSchema;
const withIdSchema = z.object({ id: uuidSchema, input: z.unknown() });
const deleteSectionSchema = z.object({
  id: uuidSchema,
  /** Present (possibly null) when the caller decided where the articles go. */
  reassignTo: optionalUuidSchema.optional(),
});
const mergeSchema = z.object({ sourceId: uuidSchema, targetId: uuidSchema });
const activeSchema = z.object({ id: uuidSchema, isActive: z.boolean() });

/* Sections */

export async function createSectionAction(input: unknown): Promise<ActionResult<Section>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const section = await service.createSection(ctx, input);
    refresh();
    return section;
  });
}

export async function updateSectionAction(input: unknown): Promise<ActionResult<Section>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { id, input: data } = withIdSchema.parse(input);
    const section = await service.updateSection(ctx, id, data);
    refresh();
    return section;
  });
}

export async function deleteSectionAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const data = deleteSectionSchema.parse(input);
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    await service.deleteSection(
      ctx,
      data.id,
      'reassignTo' in raw ? { reassignTo: data.reassignTo ?? null } : {},
    );
    refresh();
  });
}

export async function reorderSectionsAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { ids } = reorderSchema.parse(input);
    await service.reorderSections(ctx, ids);
    refresh();
  });
}

/* Tags */

export async function createTagAction(input: unknown): Promise<ActionResult<Tag>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const tag = await service.createTag(ctx, input);
    refresh();
    return tag;
  });
}

export async function updateTagAction(input: unknown): Promise<ActionResult<Tag>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { id, input: data } = withIdSchema.parse(input);
    const tag = await service.updateTag(ctx, id, data);
    refresh();
    return tag;
  });
}

export async function deleteTagAction(id: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    await service.deleteTag(ctx, idSchema.parse(id));
    refresh();
  });
}

export async function mergeTagsAction(input: unknown): Promise<ActionResult<{ target: Tag; moved: number }>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { sourceId, targetId } = mergeSchema.parse(input);
    const result = await service.mergeTags(ctx, sourceId, targetId);
    refresh();
    return result;
  });
}

/* Authors */

export async function createAuthorAction(input: unknown): Promise<ActionResult<Author>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const author = await service.createAuthor(ctx, input);
    refresh();
    return author;
  });
}

export async function updateAuthorAction(input: unknown): Promise<ActionResult<Author>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { id, input: data } = withIdSchema.parse(input);
    const author = await service.updateAuthor(ctx, id, data);
    refresh();
    return author;
  });
}

export async function setAuthorActiveAction(input: unknown): Promise<ActionResult<Author>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { id, isActive } = activeSchema.parse(input);
    const author = await service.setAuthorActive(ctx, id, isActive);
    refresh();
    return author;
  });
}

export async function deleteAuthorAction(id: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    await service.deleteAuthor(ctx, idSchema.parse(id));
    refresh();
  });
}

export async function reorderAuthorsAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('taxonomy:manage');
    const { ids } = reorderSchema.parse(input);
    await service.reorderAuthors(ctx, ids);
    refresh();
  });
}
