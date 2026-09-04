'use client';
/**
 * NotificationsBell — topbar bell with an unread counter and a popover of
 * the latest notifications. Opening a notification marks it read; "Merk alle
 * som lest" clears the counter. The full list lives at /admin/varsler.
 */
import { Bell, Check, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formatRelative } from '@/components/ui/format';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { markNotificationsRead } from './shell-actions';
import type { ShellNotification } from './shell-types';

export type NotificationsBellProps = {
  unreadCount: number;
  items: ShellNotification[];
  className?: string;
};

export function NotificationsBell({ unreadCount, items, className }: NotificationsBellProps) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label =
    unreadCount > 0 ? t('shell.notificationsUnread', { count: unreadCount }) : t('shell.notifications');

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsRead('all');
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openItem(item: ShellNotification) {
    setOpen(false);
    if (!item.readAt) {
      startTransition(async () => {
        await markNotificationsRead([item.id]);
        router.refresh();
      });
    }
    if (item.link) router.push(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'text-muted hover:bg-surface-2 hover:text-text relative inline-flex size-8 items-center justify-center rounded-md transition-colors',
          'focus-visible:outline-ring data-[state=open]:bg-surface-2 data-[state=open]:text-text focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
      >
        <Bell className="size-4" aria-hidden />
        {unreadCount > 0 ? (
          <span
            aria-hidden
            className="bg-danger absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white tabular-nums"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t('shell.notifications')}</p>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={markAll} loading={pending} leftIcon={<Check />}>
              {t('shell.markAllRead')}
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <div className="text-muted flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
            <Inbox className="size-5" aria-hidden />
            {t('shell.noNotifications')}
          </div>
        ) : (
          <ul className="max-h-[24rem] overflow-y-auto py-1" aria-label={t('shell.notifications')}>
            {items.map((item) => {
              const unread = !item.readAt;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      'hover:bg-surface-2 flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
                      'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        unread ? 'bg-primary' : 'bg-transparent',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', unread ? 'font-medium' : 'text-muted')}>
                        {item.title}
                      </span>
                      {item.body ? (
                        <span className="text-muted line-clamp-2 block text-[13px] leading-5">
                          {item.body}
                        </span>
                      ) : null}
                      <span className="text-subtle mt-0.5 block text-[11px]">
                        {formatRelative(item.createdAt)}
                      </span>
                    </span>
                    {unread ? <span className="sr-only">{t('shell.unread')}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-border border-t px-3 py-2">
          <Link
            href={adminPaths.notifications()}
            onClick={() => setOpen(false)}
            className="text-primary focus-visible:outline-ring text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('shell.allNotifications')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
