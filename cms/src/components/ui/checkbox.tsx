'use client';
/**
 * Checkbox (Radix) with an optional inline label and description.
 * Works in forms: pass `name` and it renders a hidden input when checked.
 */
import { Check, Minus } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root> & {
  label?: ReactNode;
  description?: ReactNode;
  invalid?: boolean;
};

export function Checkbox({ className, label, description, invalid, id, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;

  const box = (
    <CheckboxPrimitive.Root
      id={inputId}
      aria-invalid={invalid || undefined}
      aria-describedby={descId}
      className={cn(
        'peer bg-surface border-border-strong flex size-4 shrink-0 items-center justify-center rounded-xs border shadow-xs transition-colors',
        'hover:border-primary',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
        'aria-invalid:border-danger',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !label && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label) return box;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="flex h-6 items-center">{box}</span>
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
    </div>
  );
}
