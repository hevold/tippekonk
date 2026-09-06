/**
 * Link-based pagination for public lists (?side=2). Server-safe; uses
 * rel="prev"/"next" so crawlers follow the sequence.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type PublicPaginationProps = {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
};

function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(1, page - 2);
  const end = Math.min(pageCount, start + 4);
  const out: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) out.push(p);
  return out;
}

const itemClass =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-[var(--site-radius)] border border-border px-2.5 text-sm font-medium hover:bg-surface-2';

export function PublicPagination({ page, pageCount, hrefFor, className }: PublicPaginationProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(1, page), pageCount);
  return (
    <nav
      aria-label={t('public.pagination.label')}
      className={cn('flex flex-wrap items-center justify-center gap-2', className)}
    >
      {current > 1 ? (
        <a
          href={hrefFor(current - 1)}
          rel="prev"
          className={itemClass}
          aria-label={t('public.pagination.prev')}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </a>
      ) : null}
      {pageWindow(current, pageCount).map((p) =>
        p === current ? (
          <span
            key={p}
            aria-current="page"
            className={cn(
              itemClass,
              'border-[var(--site-primary)] bg-[var(--site-primary)] text-white hover:bg-[var(--site-primary)]',
            )}
          >
            {p}
          </span>
        ) : (
          <a
            key={p}
            href={hrefFor(p)}
            className={itemClass}
            aria-label={t('public.pagination.goto', { page: p })}
          >
            {p}
          </a>
        ),
      )}
      {current < pageCount ? (
        <a
          href={hrefFor(current + 1)}
          rel="next"
          className={itemClass}
          aria-label={t('public.pagination.next')}
        >
          <ChevronRight aria-hidden className="size-4" />
        </a>
      ) : null}
      <span className="sr-only">{t('public.pagination.page', { page: current, count: pageCount })}</span>
    </nav>
  );
}
