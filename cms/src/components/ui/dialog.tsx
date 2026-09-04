'use client';
/**
 * Dialog — modal built on Radix Dialog with title, optional description,
 * scrollable body and a footer slot. Traps focus and restores it on close.
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="Rediger seksjon" size="md"
 *     footer={<><Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button><Button>Lagre</Button></>}>
 *     …
 *   </Dialog>
 *
 * Low-level parts (DialogContent etc.) are also exported for custom layouts.
 */
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export const dialogSizeClass: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)]',
};

export const DialogRoot = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'bg-overlay fixed inset-0 z-50 backdrop-blur-[1px]',
        'animate-fade-in data-[state=closed]:animate-fade-out',
        className,
      )}
      {...props}
    />
  );
}

export type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  /** Hide the top-right close button. */
  hideClose?: boolean;
};

export function DialogContent({ className, size = 'md', hideClose, children, ...props }: DialogContentProps) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'bg-surface border-border text-text fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border shadow-lg outline-none',
          'animate-zoom-in data-[state=closed]:animate-zoom-out',
          dialogSizeClass[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            className={cn(
              'text-muted hover:bg-surface-2 hover:text-text absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-md transition-colors',
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
            aria-label={t('ui.close')}
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-5 pr-12 pb-3', className)} {...props} />;
}

export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-2', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-border flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  /** Extra classes for the content panel. */
  className?: string;
  /** Remove body padding (e.g. for a media grid). */
  flush?: boolean;
  /** Prevent closing via outside click / escape (for busy states). */
  preventClose?: boolean;
  children?: ReactNode;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  footer,
  className,
  flush,
  preventClose,
  children,
}: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={preventClose ? () => {} : onOpenChange}>
      <DialogContent
        size={size}
        className={className}
        onEscapeKeyDown={preventClose ? (e) => e.preventDefault() : undefined}
        onPointerDownOutside={preventClose ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogPrimitive.Title className="text-base leading-6 font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-muted text-sm leading-5">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">
              {typeof title === 'string' ? title : ''}
            </DialogPrimitive.Description>
          )}
        </DialogHeader>
        <DialogBody className={cn(flush && 'px-0 py-0', !footer && 'pb-5')}>{children}</DialogBody>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </DialogPrimitive.Root>
  );
}
