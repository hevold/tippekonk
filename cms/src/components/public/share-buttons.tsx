'use client';
/**
 * Share buttons for the article page: native Web Share when available,
 * copy link (Clipboard API with a status message for screen readers),
 * plus plain links to Facebook, X and e-mail that work without JavaScript,
 * and a print button.
 */
import { Check, Link as LinkIcon, Mail, Printer, Share2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type ShareButtonsProps = {
  url: string;
  title: string;
  text?: string | null;
  className?: string;
};

const subscribeNoop = () => () => {};

const buttonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-[var(--site-radius)] border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 print:hidden';

export function ShareButtons({ url, title, text, className }: ShareButtonsProps) {
  const t = useT();
  // Web Share is a browser capability: read it as an external store so the
  // server render (no navigator) and the first client render agree.
  const canShare = useSyncExternalStore(
    subscribeNoop,
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  );
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function share() {
    try {
      await navigator.share({ title, text: text ?? undefined, url });
    } catch {
      // The user dismissed the sheet; nothing to do.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-label={t('public.share.title')}>
      {canShare ? (
        <button type="button" onClick={share} className={buttonClass}>
          <Share2 aria-hidden className="size-4" />
          {t('public.share.native')}
        </button>
      ) : null}
      <button type="button" onClick={copy} className={buttonClass}>
        {status === 'copied' ? (
          <Check aria-hidden className="text-success size-4" />
        ) : (
          <LinkIcon aria-hidden className="size-4" />
        )}
        {status === 'copied' ? t('public.share.copied') : t('public.share.copy')}
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={buttonClass}
      >
        Facebook
        <span className="sr-only"> – {t('public.share.facebook')}</span>
      </a>
      <a
        href={`https://x.com/intent/post?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={buttonClass}
      >
        X<span className="sr-only"> – {t('public.share.x')}</span>
      </a>
      <a href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`} className={buttonClass}>
        <Mail aria-hidden className="size-4" />
        {t('public.share.email')}
      </a>
      <button type="button" onClick={() => window.print()} className={buttonClass}>
        <Printer aria-hidden className="size-4" />
        {t('public.share.print')}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied'
          ? t('public.share.copied')
          : status === 'failed'
            ? t('public.share.copyFailed')
            : ''}
      </span>
    </div>
  );
}
