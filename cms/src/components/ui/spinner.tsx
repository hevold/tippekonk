/**
 * Spinner — an accessible loading indicator (role="status").
 */
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type SpinnerProps = Omit<ComponentProps<'span'>, 'children'> & {
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label. Defaults to "Laster". */
  label?: string;
};

const sizes = { sm: 'size-4', md: 'size-5', lg: 'size-8' } as const;

export function Spinner({ size = 'md', label, className, ...props }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center', className)} {...props}>
      <LoaderCircle className={cn('animate-spin', sizes[size])} aria-hidden strokeWidth={2.25} />
      <span className="sr-only">{label ?? t('ui.loading')}</span>
    </span>
  );
}
