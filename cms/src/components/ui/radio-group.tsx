'use client';
/**
 * RadioGroup (Radix) rendering a list of options with optional descriptions.
 *
 *   <RadioGroup name="access" value={v} onValueChange={setV}
 *     options={[{ value: 'open', label: 'Åpen' }, { value: 'plus', label: 'Pluss', description: '…' }]} />
 */
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type RadioOption = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

export type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive.Root> & {
  options: RadioOption[];
  /** Lay options out horizontally. */
  inline?: boolean;
  invalid?: boolean;
};

export function RadioGroup({ options, inline = false, invalid, className, ...props }: RadioGroupProps) {
  const groupId = useId();
  return (
    <RadioGroupPrimitive.Root
      aria-invalid={invalid || undefined}
      className={cn('flex gap-3', inline ? 'flex-row flex-wrap gap-x-5' : 'flex-col', className)}
      {...props}
    >
      {options.map((o) => {
        const id = `${groupId}-${o.value}`;
        const descId = o.description ? `${id}-desc` : undefined;
        return (
          <div key={o.value} className="flex items-start gap-2.5">
            <span className="flex h-6 items-center">
              <RadioGroupPrimitive.Item
                id={id}
                value={o.value}
                disabled={o.disabled}
                aria-describedby={descId}
                className={cn(
                  'bg-surface border-border-strong flex size-4 shrink-0 items-center justify-center rounded-full border shadow-xs transition-colors',
                  'hover:border-primary',
                  'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
                  'data-[state=checked]:border-primary',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  invalid && 'border-danger',
                )}
              >
                <RadioGroupPrimitive.Indicator className="bg-primary block size-2 rounded-full" />
              </RadioGroupPrimitive.Item>
            </span>
            <div className="grid gap-0.5 leading-6">
              <label
                htmlFor={id}
                className={cn(
                  'text-text cursor-pointer text-sm font-medium select-none',
                  o.disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                {o.label}
              </label>
              {o.description ? (
                <p id={descId} className="text-muted text-[13px] leading-5">
                  {o.description}
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
