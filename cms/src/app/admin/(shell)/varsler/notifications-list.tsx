'use client';
/**
 * NotificationsList — full notification list with mark-all-read, open (marks
 * the item read and follows its link) and delete.
 */
import { BellOff, Check, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative } from '@/components/ui/format';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { deleteNotificationAction, markNotificationsReadAction } from '@/server/notifications/actions';

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsList({ rows, unread }: { rows: NotificationRow[]; unread: number }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsReadAction('all');
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t('users.notifications.markedAllRead'));
        router.refresh();
      }
    });
  }

  function open(item: NotificationRow) {
    if (!item.readAt) {
      startTransition(async () => {
        await markNotificationsReadAction([item.id]);
        router.refresh();
      });
    }
  }

  function remove(item: NotificationRow) {
    startTransition(async () => {
      const result = await deleteNotificationAction(item.id);
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t('users.notifications.deleted'));
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-surface border-border rounded-lg border">
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <p className="text-muted text-sm" aria-live="polite">
          {t('users.notifications.unread', { count: unread })}
        </p>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Check />}
          onClick={markAll}
          loading={pending}
          disabled={unread === 0}
        >
          {t('users.notifications.markAllRead')}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<BellOff />}
          title={t('users.notifications.empty.title')}
          description={t('users.notifications.empty.description')}
        />
      ) : (
        <ul className="divide-border divide-y" aria-label={t('users.notifications.title')}>
          {rows.map((item) => {
            const isUnread = !item.readAt;
            const content = (
              <>
                <span
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full',
                    isUnread ? 'bg-primary' : 'bg-transparent',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', isUnread ? 'text-text font-medium' : 'text-muted')}>
                    {item.title}
                    {isUnread ? (
                      <span className="sr-only"> ({t('users.notifications.unreadLabel')})</span>
                    ) : null}
                  </span>
                  {item.body ? (
                    <span className="text-muted mt-0.5 block text-[13px] leading-5">{item.body}</span>
                  ) : null}
                  <span className="text-subtle mt-1 block text-[11px]">
                    <time dateTime={item.createdAt}>{formatRelative(item.createdAt)}</time>
                  </span>
                </span>
              </>
            );
            return (
              <li key={item.id} className="flex items-start gap-2 px-3 py-2.5">
                {item.link ? (
                  <Link
                    href={item.link}
                    onClick={() => open(item)}
                    className="hover:bg-surface-2 focus-visible:outline-ring flex min-w-0 flex-1 items-start gap-3 rounded-md px-2 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="hover:bg-surface-2 focus-visible:outline-ring flex min-w-0 flex-1 items-start gap-3 rounded-md px-2 py-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  >
                    {content}
                  </button>
                )}
                <IconButton
                  label={t('users.notifications.delete')}
                  size="sm"
                  onClick={() => remove(item)}
                  className="text-muted"
                >
                  <Trash2 />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
