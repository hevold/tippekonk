'use client';
/**
 * Pagination — link-based (`hrefFor`) for server-rendered lists, or
 * callback-based (`onPageChange`) for client state.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { paginationRange } from './pagination-range';

export type PaginationProps = {
  page: number;
  pageCount: number;
  hrefFor?: (page: number) => string;
  onPageChange?: (page: number) => void;
  /** Show "Side 2 av 10" text. */
  showSummary?: boolean;
  className?: string;
};

const itemClass = cn(
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors',
  'text-muted hover:bg-surface-2 hover:text-text',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  'aria-disabled:pointer-events-none aria-disabled:opacity-40',
  '[&_svg]:size-4',
);
const activeClass = 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary';

export function Pagination({ page, pageCount, hrefFor, onPageChange, showSummary = true, className }: PaginationProps) {
  const t = useT();
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(1, page), pageCount);
  const tokens = paginationRange(current, pageCount);

  const renderItem = (target: number, label: ReactNode, opts: { ariaLabel?: string; active?: boolean; disabled?: boolean }) => {
    const cls = cn(itemClass, opts.active && activeClass);
    if (hrefFor && !opts.disabled) {
      return (
        <Link
          href={hrefFor(target)}
          className={cls}
          aria-label={opts.ariaLabel}
          aria-current={opts.active ? 'page' : undefined}
        >
          {label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        className={cls}
        aria-label={opts.ariaLabel}
        aria-current={opts.active ? 'page' : undefined}
        aria-disabled={opts.disabled || undefined}
        disabled={opts.disabled}
        onClick={() => onPageChange?.(target)}
      >
        {label}
      </button>
    );
  };

  return (
    <nav
      aria-label={t('ui.pagination.label')}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      {showSummary ? (
        <p className="text-muted text-sm tabular-nums">
          {t('ui.pagination.summary', { page: current, pageCount })}
        </p>
      ) : (
        <span />
      )}
      <ul className="flex items-center gap-1">
        <li>
          {renderItem(current - 1, <ChevronLeft aria-hidden />, {
            ariaLabel: t('ui.pagination.previous'),
            disabled: current <= 1,
          })}
        </li>
        {tokens.map((token, i) =>
          token === 'ellipsis' ? (
            <li key={`e${i}`} className="text-subtle px-1 text-sm" aria-hidden>
              …
            </li>
          ) : (
            <li key={token}>
              {renderItem(token, token, {
                ariaLabel: t('ui.pagination.page', { page: token }),
                active: token === current,
              })}
            </li>
          ),
        )}
        <li>
          {renderItem(current + 1, <ChevronRight aria-hidden />, {
            ariaLabel: t('ui.pagination.next'),
            disabled: current >= pageCount,
          })}
        </li>
      </ul>
    </nav>
  );
}
