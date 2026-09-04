/**
 * StatCard — a number with a label, used on the dashboard and overview pages.
 * Becomes a link when `href` is set. Server-safe.
 *
 *   <StatCard label="Til gjennomsyn" value={4} icon={<Eye />} tone="warning" href="/admin/artikler?status=in_review" />
 */
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { formatNumber } from '@/components/ui/format';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export type StatCardProps = {
  label: ReactNode;
  value: number | string;
  /** Small text under the value, e.g. "3 siste døgn". */
  hint?: ReactNode;
  icon?: ReactNode;
  href?: string;
  tone?: StatTone;
  /** Extra classes for the value (e.g. a status colour). */
  valueClassName?: string;
  className?: string;
};

const toneClass: Record<StatTone, string> = {
  default: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  muted: 'bg-surface-2 text-muted',
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  tone = 'default',
  valueClassName,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted text-[13px] leading-5 font-medium">{label}</p>
        {icon ? (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
              toneClass[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className={cn('mt-1 text-2xl leading-8 font-semibold tracking-tight tabular-nums', valueClassName)}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      {hint || href ? (
        <p className="text-subtle mt-1 flex items-center gap-1 text-xs">
          {hint}
          {href ? (
            <ArrowRight
              className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          ) : null}
        </p>
      ) : null}
    </>
  );
  const classes = cn(
    'bg-surface border-border group flex flex-col rounded-lg border px-4 py-3 shadow-xs',
    href &&
      'hover:border-border-strong transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
