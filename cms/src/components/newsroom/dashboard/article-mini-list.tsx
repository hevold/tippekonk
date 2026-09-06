/**
 * ArticleMiniList — compact rows (title, status, meta line) used by the
 * dashboard panels. Server-safe; the deadline cell is a small client leaf.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Deadline } from '@/components/newsroom/deadline';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { adminPaths } from '@/config/routes';
import { formatDate, formatRelative } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { DashboardArticle } from '@/server/dashboard/queries';

export type ArticleMiniListProps = {
  items: DashboardArticle[];
  now: Date;
  /** What to show on the right side of the meta line. */
  meta?: 'updated' | 'published' | 'deadline' | 'age';
  /** Optional per-row trailing element (e.g. a date badge). */
  trailing?: (item: DashboardArticle) => ReactNode;
  emptyTitle: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  showStatus?: boolean;
};

export function ArticleMiniList({
  items,
  now,
  meta = 'updated',
  trailing,
  emptyTitle,
  emptyDescription,
  emptyAction,
  showStatus = true,
}: ArticleMiniListProps) {
  if (items.length === 0) {
    return <EmptyState compact title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return (
    <ul className="divide-border divide-y" role="list">
      {items.map((a) => {
        const title = a.title.trim() || t('dashboard.untitled');
        return (
          <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                href={adminPaths.article(a.id)}
                className={cn(
                  'focus-visible:outline-ring block truncate text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                  !a.title.trim() && 'text-muted italic',
                )}
              >
                {title}
              </Link>
              <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                {a.sectionName ? <span>{a.sectionName}</span> : null}
                {meta === 'updated' ? (
                  <span>
                    <time dateTime={a.updatedAt.toISOString()}>{formatRelative(a.updatedAt, now)}</time>
                    {a.updatedByName ? ` · ${a.updatedByName}` : ''}
                  </span>
                ) : null}
                {meta === 'age' ? (
                  <span>
                    {t('dashboard.review.waiting', { time: formatRelative(a.updatedAt, now) })}
                    {a.updatedByName ? ` · ${a.updatedByName}` : ''}
                  </span>
                ) : null}
                {meta === 'published' && a.publishedAt ? (
                  <time dateTime={a.publishedAt.toISOString()}>{formatDate(a.publishedAt, 'datetime')}</time>
                ) : null}
                {meta === 'deadline' ? (
                  <span className="inline-flex items-center gap-1">
                    {a.assignedToName ?? t('dashboard.unassigned')} · <Deadline deadlineAt={a.deadlineAt} status={a.status} now={now} />
                  </span>
                ) : null}
              </p>
            </div>
            {trailing ? trailing(a) : showStatus ? <StatusBadge status={a.status} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
