/**
 * Input — a styled native text input. Pair with <FormField> for label/help/error.
 * Set `invalid` (or aria-invalid) to show the error state.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export const inputClassName = cn(
  'bg-surface text-text placeholder:text-subtle flex h-9 w-full min-w-0 rounded-md border px-3 text-[15px]',
  'border-border shadow-xs transition-colors',
  'hover:border-border-strong',
  'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
  'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
  'disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70',
  'file:text-text file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium',
);

export type InputProps = ComponentProps<'input'> & {
  invalid?: boolean;
  /** Compact variant used in toolbars and tables. */
  size?: 'sm' | 'md';
};

export function Input({ className, invalid, size = 'md', type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(inputClassName, size === 'sm' && 'h-8 px-2.5 text-sm', className)}
      {...props}
    />
  );
}
