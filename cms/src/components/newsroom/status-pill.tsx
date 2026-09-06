'use client';
/**
 * StatusPill — client-side twin of <StatusBadge> (which uses the request
 * locale on the server). Same colours, label through useT().
 */
import type { ArticleStatus } from '@/db/schema';
import { statusBadgeClass, statusDotClass, statusLabelKey } from '@/components/ui/badge-variants';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type StatusPillProps = { status: ArticleStatus; compact?: boolean; className?: string };

export function StatusPill({ status, compact = false, className }: StatusPillProps) {
  const t = useT();
  const label = t(statusLabelKey(status));
  if (compact) {
    return (
      <span className={cn('text-text inline-flex items-center gap-1.5 text-sm', className)}>
        <span className={cn('size-2 shrink-0 rounded-full', statusDotClass[status])} aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        statusBadgeClass[status],
        className,
      )}
    >
      {label}
    </span>
  );
}
