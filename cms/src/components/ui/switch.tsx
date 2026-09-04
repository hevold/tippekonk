'use client';
/**
 * Switch (Radix) with optional label and description. Prefer it for
 * on/off settings that take effect immediately; use Checkbox in forms.
 */
import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
};

export function Switch({ className, label, description, size = 'md', id, ...props }: SwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;

  const control = (
    <SwitchPrimitive.Root
      id={inputId}
      aria-describedby={descId}
      className={cn(
        'peer bg-border-strong relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        !label && className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm transition-transform',
          size === 'sm'
            ? 'size-3 translate-x-0.5 data-[state=checked]:translate-x-3.5'
            : 'size-4 translate-x-0.5 data-[state=checked]:translate-x-4.5',
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="grid gap-0.5 leading-6">
        <label htmlFor={inputId} className="text-text cursor-pointer text-sm font-medium select-none">
          {label}
        </label>
        {description ? (
          <p id={descId} className="text-muted text-[13px] leading-5">
            {description}
          </p>
        ) : null}
      </div>
      <span className="flex h-6 items-center">{control}</span>
    </div>
  );
}
