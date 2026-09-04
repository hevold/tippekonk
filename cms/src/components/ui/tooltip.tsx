'use client';
/**
 * Tooltip — wraps a single focusable child and shows `content` on hover/focus.
 * A TooltipProvider is included per tooltip (short delay) so consumers do not
 * need to set one up; wrap a tree in <TooltipProvider> to share the delay.
 */
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

export type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Delay before showing, in ms. */
  delayDuration?: number;
  className?: string;
  /** Do not render a tooltip at all when false (handy for conditional labels). */
  enabled?: boolean;
};

export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'center',
  delayDuration = 300,
  className,
  enabled = true,
}: TooltipProps) {
  if (!enabled || content === null || content === undefined || content === '') return <>{children}</>;
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={cn(
              'bg-text text-bg z-50 max-w-xs rounded-md px-2 py-1 text-xs font-medium shadow-md',
              'animate-fade-in data-[state=closed]:animate-fade-out',
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
