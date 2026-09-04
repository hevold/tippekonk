/**
 * PageHeader — title row at the top of every admin page, with optional
 * breadcrumbs, description and right-aligned actions. Breadcrumbs is also
 * exported on its own.
 */
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type BreadcrumbItem = { label: ReactNode; href?: string };

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={t('ui.breadcrumbs')} className={cn('text-muted text-[13px]', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="hover:text-text focus-visible:outline-ring rounded-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn(last && 'text-text')}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="text-subtle size-3.5" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  /** Small element rendered before the title (e.g. a StatusBadge). */
  eyebrow?: ReactNode;
  /** Sticks to the top of the content area while scrolling. */
  sticky?: boolean;
  className?: string;
  children?: ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
  sticky,
  className,
  children,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-5 flex flex-col gap-3',
        sticky && 'bg-bg/90 sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 backdrop-blur',
        className,
      )}
    >
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? <div className="mb-1 flex items-center gap-2">{eyebrow}</div> : null}
          <h1 className="text-text truncate text-xl leading-7 font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted mt-1 max-w-2xl text-sm leading-5">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
