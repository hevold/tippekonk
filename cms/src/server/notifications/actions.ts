'use server';
/**
 * Server actions for /admin/varsler: mark all (or some) notifications as
 * read and delete one. Only the caller's own rows are touched.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import { runAction, type ActionResult } from '@/server/actions';
import { requireAdminContext } from '@/server/auth/guards';

import { deleteNotification, markRead } from './index';

const idsSchema = z.union([z.literal('all'), z.array(z.uuid()).min(1).max(200)]);

export async function markNotificationsReadAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ids = idsSchema.parse(input);
    const ctx = await requireAdminContext();
    await markRead(ctx.user.id, ids);
    refresh();
  });
}

export async function deleteNotificationAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = z.uuid().parse(input);
    const ctx = await requireAdminContext();
    await deleteNotification(ctx.user.id, id);
    refresh();
  });
}
