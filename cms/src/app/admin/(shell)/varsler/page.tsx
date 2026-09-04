/**
 * /admin/varsler — the signed-in user's notifications, newest first, with
 * "merk alle som lest" and per-item delete.
 */
import type { Metadata } from 'next';

import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { countUnread, listNotifications } from '@/server/notifications';

import { NotificationsList, type NotificationRow } from './notifications-list';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Varsler' };

export default async function NotificationsPage() {
  const ctx = await getAdminContext();
  const [items, unread] = await Promise.all([
    listNotifications(ctx.user.id, { limit: 100 }),
    countUnread(ctx.user.id),
  ]);
  const rows: NotificationRow[] = items.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader title={t('users.notifications.title')} description={t('users.notifications.description')} />
      <NotificationsList rows={rows} unread={unread} />
    </>
  );
}
