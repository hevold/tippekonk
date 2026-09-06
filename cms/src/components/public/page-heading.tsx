/**
 * Heading block for listing pages (section, tag, author, search): a small
 * eyebrow label, the h1 and an optional description, with room for an
 * image (author photo) and trailing actions (RSS link, sub-section chips).
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type PageHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string | null;
  image?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function PageHeading({
  eyebrow,
  title,
  description,
  image,
  actions,
  children,
  className,
}: PageHeadingProps) {
  return (
    <div className={cn('border-border mb-8 border-b pb-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {image}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-bold tracking-wide text-[var(--site-accent)] uppercase">{eyebrow}</p>
            ) : null}
            <h1 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
              {title}
            </h1>
            {description ? <p className="text-muted mt-2 max-w-2xl text-base">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Horizontal list of link chips (child sections). */
export function ChipList({
  items,
  label,
}: {
  items: { href: string; label: string; active?: boolean }[];
  label: string;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label={label} className="mt-4">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'hover:bg-surface-2 inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium',
                item.active
                  ? 'border-[var(--site-primary)] bg-[var(--site-primary)] text-white hover:bg-[var(--site-primary)]'
                  : 'border-border',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
