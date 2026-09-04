/**
 * Progress — determinate progress bar (0–100). Pass `indeterminate` for unknown duration.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type ProgressProps = Omit<ComponentProps<'div'>, 'children'> & {
  value: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
  size?: 'sm' | 'md';
  variant?: 'primary' | 'success' | 'warning' | 'danger';
};

const barClass = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
} as const;

export function Progress({
  value,
  max = 100,
  label,
  indeterminate,
  size = 'md',
  variant = 'primary',
  className,
  ...props
}: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      className={cn('bg-surface-3 relative w-full overflow-hidden rounded-full', size === 'sm' ? 'h-1' : 'h-2', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-300',
          barClass[variant],
          indeterminate && 'animate-progress-slide absolute left-0 w-1/3',
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
