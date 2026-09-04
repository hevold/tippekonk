/**
 * NativeSelect — a styled native <select>. Use for short option lists and in
 * server-rendered forms; use <Combobox> for searchable or long lists.
 */
import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type NativeSelectProps = Omit<ComponentProps<'select'>, 'size'> & {
  options: SelectOption[];
  /** Placeholder rendered as a disabled first option (value ''). */
  placeholder?: string;
  invalid?: boolean;
  size?: 'sm' | 'md';
};

export function NativeSelect({
  options,
  placeholder,
  invalid,
  size = 'md',
  className,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <span className={cn('relative inline-flex w-full', className)}>
      <select
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        className={cn(
          'bg-surface text-text w-full cursor-pointer appearance-none rounded-md border pr-8 pl-3 shadow-xs',
          'border-border hover:border-border-strong transition-colors',
          'focus-visible:border-ring focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
          'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
          'disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70',
          size === 'sm' ? 'h-8 text-sm' : 'h-9 text-[15px]',
        )}
        {...props}
      >
        {placeholder !== undefined ? (
          <option value="" disabled={props.required}>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </span>
  );
}
