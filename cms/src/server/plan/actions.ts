'use server';
/**
 * Redaksjonsplan server actions: patch assignee/deadline/planned date from
 * the calendar (move dialog, assign menu). Creating a planned story from a
 * day uses the editor's createArticleAction with `plannedAt` set, so this
 * file only owns the planning fields.
 */
import { refresh } from 'next/cache';

import type { Article } from '@/db/schema';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { pickPlanningPatch, planningPatchSchema, updatePlanning } from './service';

/** Update any subset of { assignedTo, deadlineAt, plannedAt }. Keys not sent are left untouched. */
export async function updatePlanningAction(input: unknown): Promise<ActionResult<Article>> {
  return runAction(async () => {
    const ctx = await requirePermission('article:edit_own');
    const parsed = planningPatchSchema.parse(input);
    const patch = pickPlanningPatch(input, parsed);
    const article = await updatePlanning(ctx, parsed.id, patch);
    refresh();
    return article;
  });
}
