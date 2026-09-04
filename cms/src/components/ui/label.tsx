/**
 * Label — form label with optional required marker.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type LabelProps = ComponentProps<'label'> & {
  required?: boolean;
};

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-text inline-flex items-baseline gap-1 text-sm leading-5 font-medium', className)}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-danger" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}
