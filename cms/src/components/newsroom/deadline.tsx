'use client';
/**
 * Deadline — "Frist" cell: relative time, red and bold when overdue for a
 * story that is not yet published. Renders a <time> element.
 */
import { CalendarClock, TriangleAlert } from 'lucide-react';

import { formatDateTime, formatRelative } from '@/components/ui/format';
import type { ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type DeadlineProps = {
  deadlineAt: string | Date | null;
  status: ArticleStatus;
  now?: Date;
  className?: string;
};

const OPEN: ArticleStatus[] = ['draft', 'in_review', 'approved'];

export function isOverdue(deadlineAt: string | Date | null, status: ArticleStatus, now: Date = new Date()): boolean {
  if (!deadlineAt || !OPEN.includes(status)) return false;
  return new Date(deadlineAt).getTime() < now.getTime();
}

export function Deadline({ deadlineAt, status, now = new Date(), className }: DeadlineProps) {
  const t = useT();
  if (!deadlineAt) return <span className="text-subtle">–</span>;
  const date = new Date(deadlineAt);
  const overdue = isOverdue(date, status, now);
  return (
    <time
      dateTime={date.toISOString()}
      title={formatDateTime(date)}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap [&_svg]:size-3.5',
        overdue ? 'text-danger font-medium' : 'text-muted',
        className,
      )}
    >
      {overdue ? <TriangleAlert aria-hidden /> : <CalendarClock aria-hidden />}
      {formatRelative(date, now)}
      {overdue ? <span className="sr-only"> ({t('list.overdue')})</span> : null}
    </time>
  );
}
