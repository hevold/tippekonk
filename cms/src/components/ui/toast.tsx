'use client';
/**
 * Toasts via sonner with Norwegian defaults and Desken styling.
 *
 *   import { toast } from '@/components/ui/toast';
 *   toast.success('Lagret');  toast.error('Kunne ikke lagre. Prøv igjen.');
 *
 * Mount <Toaster /> once, in the admin shell layout.
 */
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { Toaster as SonnerToaster, toast, type ToasterProps } from 'sonner';

import { useT } from '@/lib/i18n/client';

export { toast };

export function Toaster(props: ToasterProps) {
  const t = useT();
  return (
    <SonnerToaster
      position="bottom-right"
      theme="system"
      closeButton
      duration={4000}
      visibleToasts={4}
      gap={8}
      offset={16}
      containerAriaLabel={t('ui.toast.region')}
      icons={{
        success: <CircleCheck className="text-success size-4" aria-hidden />,
        error: <CircleAlert className="text-danger size-4" aria-hidden />,
        warning: <TriangleAlert className="text-warning size-4" aria-hidden />,
        info: <Info className="text-info size-4" aria-hidden />,
        loading: <LoaderCircle className="text-muted size-4 animate-spin" aria-hidden />,
        close: <X className="size-3.5" aria-hidden />,
      }}
      toastOptions={{
        closeButtonAriaLabel: t('ui.close'),
        unstyled: true,
        classNames: {
          toast:
            'bg-surface text-text border-border flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg font-sans',
          title: 'font-medium leading-5',
          description: 'text-muted text-[13px] leading-5 mt-0.5',
          icon: 'mt-0.5 shrink-0',
          content: 'min-w-0 flex-1',
          actionButton:
            'bg-primary text-primary-foreground hover:bg-primary-hover ml-auto shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
          cancelButton: 'bg-surface-2 text-text hover:bg-surface-3 ml-2 shrink-0 rounded-md px-2.5 py-1 text-xs font-medium',
          closeButton:
            'bg-surface border-border text-muted hover:text-text hover:bg-surface-2 absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full border shadow-xs',
          error: '[&_[data-title]]:text-danger',
        },
      }}
      {...props}
    />
  );
}
