'use server';
/**
 * Content type server actions for /admin/innholdstyper. Thin wrappers:
 * permission → validate ids → service (which validates the payload, audits
 * and revalidates) → refresh the router.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import type { ContentType } from '@/db/schema';
import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import * as service from './service';

const withIdSchema = z.object({ id: uuidSchema, input: z.unknown() });

export async function createContentTypeAction(input: unknown): Promise<ActionResult<ContentType>> {
  return runAction(async () => {
    const ctx = await requirePermission('content_type:manage');
    const created = await service.createContentType(ctx, input);
    refresh();
    return created;
  });
}

export async function updateContentTypeAction(input: unknown): Promise<ActionResult<ContentType>> {
  return runAction(async () => {
    const ctx = await requirePermission('content_type:manage');
    const { id, input: data } = withIdSchema.parse(input);
    const updated = await service.updateContentType(ctx, id, data);
    refresh();
    return updated;
  });
}

export async function setDefaultContentTypeAction(id: unknown): Promise<ActionResult<ContentType>> {
  return runAction(async () => {
    const ctx = await requirePermission('content_type:manage');
    const updated = await service.setDefaultContentType(ctx, uuidSchema.parse(id));
    refresh();
    return updated;
  });
}

export async function deleteContentTypeAction(id: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('content_type:manage');
    await service.deleteContentType(ctx, uuidSchema.parse(id));
    refresh();
  });
}
