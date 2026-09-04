/**
 * In-app notifications (bell in the topbar, list at /admin/varsler).
 *
 *   await notify([editorId], { siteId, kind: 'article.review_requested', title: '…', link: '/admin/artikler/<id>' });
 *   const items = await listNotifications(userId, { unreadOnly: true, limit: 20 });
 *   await markRead(userId, ['<id>']);   // or 'all'
 *
 * Notifications are best-effort: a failure to insert must never break the
 * mutation that triggered it, so `notify` logs and swallows errors.
 */
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { notifications, type Notification } from '@/db/schema';

export type NotifyInput = {
  siteId?: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
};

export async function notify(userIds: string[], n: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await db.insert(notifications).values(
      unique.map((userId) => ({
        userId,
        siteId: n.siteId ?? null,
        kind: n.kind,
        title: n.title.slice(0, 300),
        body: n.body ? n.body.slice(0, 2000) : null,
        link: n.link ?? null,
      })),
    );
  } catch (err) {
    console.error('[notifications]', err);
  }
}

export type ListNotificationsOptions = { unreadOnly?: boolean; limit?: number };

export async function listNotifications(
  userId: string,
  opts: ListNotificationsOptions = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const where = opts.unreadOnly
    ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
    : eq(notifications.userId, userId);
  return db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows[0]?.value ?? 0;
}

/** Mark the user's own notifications as read (never someone else's, whatever ids are passed). */
export async function markRead(userId: string, ids: string[] | 'all'): Promise<void> {
  if (ids !== 'all' && ids.length === 0) return;
  const where =
    ids === 'all'
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : and(eq(notifications.userId, userId), isNull(notifications.readAt), inArray(notifications.id, ids));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}

/** Remove one of the user's notifications. */
export async function deleteNotification(userId: string, id: string): Promise<void> {
  await db.delete(notifications).where(and(eq(notifications.userId, userId), eq(notifications.id, id)));
}
