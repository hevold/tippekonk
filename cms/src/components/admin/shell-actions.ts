'use server';
/**
 * Server actions used by the admin shell chrome: switching the active site
 * (cookie `desken_site`) and marking notifications as read from the bell.
 * Both verify the session through getAdminContext() and touch only rows the
 * caller owns or may see.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { db } from '@/db';
import { notifications, type Site } from '@/db/schema';
import { t } from '@/lib/i18n';
import { ForbiddenError, runAction, type ActionResult } from '@/server/actions';
// INTEGRATION: both provided by the auth area (SPEC 4.2).
import { getAdminContext } from '@/server/auth/context';
import { SITE_COOKIE } from '@/server/auth/session';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Switch the active site for this session. The target must be one of the sites the user can switch to. */
export async function switchSite(input: unknown): Promise<ActionResult<{ siteId: string }>> {
  return runAction(async () => {
    const siteId = z.uuid().parse(input);
    const ctx = await getAdminContext();
    const target = ctx.sites.find((s: Site) => s.id === siteId);
    if (!target) throw new ForbiddenError(t('shell.notMember'));
    const jar = await cookies();
    jar.set(SITE_COOKIE, target.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
    });
    refresh();
    return { siteId: target.id };
  });
}

const markReadSchema = z.union([z.literal('all'), z.array(z.uuid()).min(1).max(100)]);

/** Mark the caller's notifications as read: specific ids or 'all'. */
export async function markNotificationsRead(input: unknown): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    const ids = markReadSchema.parse(input);
    const ctx = await getAdminContext();
    const now = new Date();
    const where =
      ids === 'all'
        ? and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))
        : and(
            eq(notifications.userId, ctx.user.id),
            isNull(notifications.readAt),
            inArray(notifications.id, ids),
          );
    const updated = await db
      .update(notifications)
      .set({ readAt: now })
      .where(where)
      .returning({ id: notifications.id });
    refresh();
    return { updated: updated.length };
  });
}
