'use client';
/**
 * SavingIndicator — autosave status with aria-live announcements.
 * state: idle | saving | saved | error; `savedAt` renders "Lagret 14:02".
 */
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { formatTime } from './format';

export type SavingState = 'idle' | 'saving' | 'saved' | 'error';

export type SavingIndicatorProps = {
  state: SavingState;
  savedAt?: Date | null;
  /** Error detail shown after "Kunne ikke lagre". */
  error?: string;
  className?: string;
};

export function SavingIndicator({ state, savedAt, error, className }: SavingIndicatorProps) {
  const t = useT();
  let icon: React.ReactNode = null;
  let text = '';
  let tone = 'text-muted';

  if (state === 'saving') {
    icon = <LoaderCircle className="size-3.5 animate-spin" aria-hidden />;
    text = t('ui.saving.saving');
  } else if (state === 'saved') {
    icon = <Check className="size-3.5" aria-hidden />;
    text = savedAt ? t('ui.saving.savedAt', { time: formatTime(savedAt) }) : t('ui.saving.saved');
    tone = 'text-success';
  } else if (state === 'error') {
    icon = <CircleAlert className="size-3.5" aria-hidden />;
    text = error ? `${t('ui.saving.error')} ${error}` : t('ui.saving.error');
    tone = 'text-danger';
  } else if (savedAt) {
    text = t('ui.saving.savedAt', { time: formatTime(savedAt) });
  }

  return (
    <span
      role="status"
      aria-live={state === 'error' ? 'assertive' : 'polite'}
      aria-atomic
      className={cn('inline-flex min-h-5 items-center gap-1.5 text-xs font-medium tabular-nums', tone, className)}
    >
      {icon}
      {text}
    </span>
  );
}
