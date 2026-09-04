/**
 * StatusBadge — ArticleStatus → coloured pill with the Norwegian label.
 * Server-safe (uses t() from the request locale).
 */
import type { ComponentProps } from 'react';

import type { ArticleStatus } from '@/db/schema';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import { statusBadgeClass, statusDotClass, statusLabelKey } from './badge-variants';

export type StatusBadgeProps = Omit<ComponentProps<'span'>, 'children'> & {
  status: ArticleStatus;
  /** Compact: coloured dot + label without the pill background. */
  compact?: boolean;
};

export function StatusBadge({ status, compact = false, className, ...props }: StatusBadgeProps) {
  const label = t(statusLabelKey(status));
  if (compact) {
    return (
      <span className={cn('text-text inline-flex items-center gap-1.5 text-sm', className)} {...props}>
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
      {...props}
    >
      {label}
    </span>
  );
}
