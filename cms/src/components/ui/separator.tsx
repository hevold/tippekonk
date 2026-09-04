/**
 * Separator — horizontal or vertical divider line.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type SeparatorProps = ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical';
  /** Purely visual (aria-hidden). Default true. */
  decorative?: boolean;
};

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? undefined : 'separator'}
      aria-hidden={decorative || undefined}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'bg-border shrink-0',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
