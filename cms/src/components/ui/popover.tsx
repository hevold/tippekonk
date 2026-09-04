'use client';
/**
 * Popover — Radix Popover with the Desken look.
 */
import { Popover as PopoverPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'bg-surface border-border text-text z-50 w-72 rounded-md border p-3 shadow-md outline-none',
          'animate-slide-down data-[state=closed]:animate-fade-out',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
