'use server';
/**
 * Redirect server actions (settings → Omdirigeringer): create, edit, delete,
 * CSV import and a "test path" lookup that follows chains without counting hits.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import type { Redirect } from '@/db/schema';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import {
  createRedirect,
  deleteRedirect,
  importRedirects,
  lookupRedirect,
  updateRedirect,
  type ImportResult,
  type RedirectLookup,
} from './index';

export async function createRedirectAction(input: unknown): Promise<ActionResult<Redirect>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    const row = await createRedirect(ctx, input);
    refresh();
    return row;
  });
}

export async function updateRedirectAction(id: unknown, input: unknown): Promise<ActionResult<Redirect>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    const row = await updateRedirect(ctx, id, input);
    refresh();
    return row;
  });
}

export async function deleteRedirectAction(id: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    await deleteRedirect(ctx, id);
    refresh();
    return { id: z.uuid().parse(id) };
  });
}

export async function importRedirectsAction(csv: unknown): Promise<ActionResult<ImportResult>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    const result = await importRedirects(ctx, csv);
    refresh();
    return result;
  });
}

const testSchema = z.string().trim().min(1, 'Skriv inn en sti').max(2000);

/** Preview what a visitor to `path` would get (no hit counting). */
export async function testRedirectAction(path: unknown): Promise<ActionResult<RedirectLookup>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    return lookupRedirect(ctx.site.id, testSchema.parse(path));
  });
}
