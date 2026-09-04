'use client';
/**
 * Sheet — a side panel (drawer) built on Radix Dialog. Used for filters,
 * detail panes and the mobile navigation.
 */
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type SheetSide = 'right' | 'left';
export type SheetSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<SheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
  xl: 'sm:max-w-3xl',
};

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  side?: SheetSide;
  size?: SheetSize;
  footer?: ReactNode;
  /** Visually hide the header (title stays for screen readers). */
  hideHeader?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = 'right',
  size = 'md',
  footer,
  hideHeader,
  className,
  children,
}: SheetProps) {
  const t = useT();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn('bg-overlay fixed inset-0 z-50', 'animate-fade-in data-[state=closed]:animate-fade-out')}
        />
        <DialogPrimitive.Content
          className={cn(
            'bg-surface text-text fixed inset-y-0 z-50 flex h-full w-full flex-col shadow-lg outline-none',
            side === 'right'
              ? 'border-border right-0 border-l animate-slide-in-right data-[state=closed]:animate-slide-out-right'
              : 'border-border left-0 border-r animate-slide-in-left data-[state=closed]:animate-slide-out-left',
            sizeClass[size],
            className,
          )}
        >
          <div
            className={cn(
              'border-border flex items-start justify-between gap-4 border-b px-5 py-4',
              hideHeader && 'sr-only',
            )}
          >
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base leading-6 font-semibold">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-muted mt-0.5 text-sm leading-5">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : ''}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className={cn(
                'text-muted hover:bg-surface-2 hover:text-text -mt-1 -mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              )}
              aria-label={t('ui.close')}
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          {hideHeader ? (
            <DialogPrimitive.Close
              className={cn(
                'text-muted hover:bg-surface-2 hover:text-text absolute top-3 right-3 z-10 inline-flex size-7 items-center justify-center rounded-md transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              )}
              aria-label={t('ui.close')}
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="border-border flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
