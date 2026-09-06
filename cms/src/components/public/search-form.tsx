'use client';
/**
 * Site search form (GET /sok?q=). Works without JavaScript as a plain form;
 * the client part keeps the input controlled, trims before submitting and
 * offers a compact "icon only" mode for the masthead that expands on focus.
 */
import { Search } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';

import { publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type SearchFormProps = {
  siteName: string;
  initialQuery?: string;
  /** Larger layout for the search page. */
  size?: 'compact' | 'large';
  className?: string;
  autoFocus?: boolean;
};

export function SearchForm({
  siteName,
  initialQuery = '',
  size = 'compact',
  className,
  autoFocus,
}: SearchFormProps) {
  const t = useT();
  const [value, setValue] = useState(initialQuery);
  const id = useId();
  const inputId = `search-${id}`;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const q = value.trim();
    if (!q) {
      e.preventDefault();
      return;
    }
    if (q !== value) setValue(q);
  }

  const large = size === 'large';
  return (
    <form
      role="search"
      action={publicPaths.search()}
      method="get"
      onSubmit={onSubmit}
      className={cn('flex items-stretch', large ? 'gap-2' : 'gap-1', className)}
      aria-label={t('public.search.label')}
    >
      <label htmlFor={inputId} className="sr-only">
        {t('public.search.label')}
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t('public.search.placeholder', { site: siteName })}
        autoComplete="off"
        autoFocus={autoFocus}
        minLength={2}
        maxLength={200}
        className={cn(
          'border-border bg-surface text-text placeholder:text-subtle min-w-0 rounded-[var(--site-radius)] border focus-visible:border-[var(--site-primary)]',
          large
            ? 'h-12 flex-1 px-4 text-base'
            : 'h-9 w-36 px-3 text-sm transition-[width] focus:w-56 md:w-44 md:focus:w-64',
        )}
      />
      <button
        type="submit"
        className={cn(
          'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--site-radius)] bg-[var(--site-primary)] font-semibold text-white hover:opacity-90',
          large ? 'h-12 px-5 text-base' : 'size-9',
        )}
        aria-label={large ? undefined : t('public.search.submit')}
      >
        <Search aria-hidden className={large ? 'size-5' : 'size-4'} />
        {large ? <span>{t('public.search.submit')}</span> : null}
      </button>
    </form>
  );
}
