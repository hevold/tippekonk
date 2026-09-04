'use client';
/**
 * ConfirmDialog — "Er du sikker?" built on Radix AlertDialog. `onConfirm` may
 * be async; the confirm button shows a spinner and the dialog closes on success.
 * Errors are surfaced via toast and keep the dialog open.
 */
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useState, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { Button } from './button';
import { toast } from './toast';

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for irreversible actions. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const t = useT();
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error('[ui] confirm action failed', err);
      toast.error(err instanceof Error && err.message ? err.message : t('ui.error.generic'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={pending ? () => {} : onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay
          className={cn(
            'bg-overlay fixed inset-0 z-50 backdrop-blur-[1px]',
            'animate-fade-in data-[state=closed]:animate-fade-out',
          )}
        />
        <AlertDialogPrimitive.Content
          className={cn(
            'bg-surface border-border text-text fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border p-5 shadow-lg outline-none',
            'animate-zoom-in data-[state=closed]:animate-zoom-out',
          )}
        >
          <AlertDialogPrimitive.Title className="text-base leading-6 font-semibold">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="text-muted mt-1 text-sm leading-5">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          {children ? <div className="mt-3 text-sm">{children}</div> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                {cancelLabel ?? t('ui.cancel')}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={pending}
              onClick={handleConfirm}
              autoFocus
            >
              {confirmLabel ?? t('ui.confirm')}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
