'use client';
/**
 * SearchInput — text input with a search icon, clear button and debounced
 * `onChange` (default 250 ms). The visible value updates immediately.
 */
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentProps } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { inputClassName } from './input';

export type SearchInputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'size'> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  size?: 'sm' | 'md';
};

export function SearchInput({
  value,
  onChange,
  placeholder,
  debounceMs = 250,
  size = 'md',
  className,
  ...props
}: SearchInputProps) {
  const t = useT();
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Sync when the parent resets the value (e.g. "Nullstill filtre").
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function update(next: string) {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    if (debounceMs <= 0) {
      latest.current(next);
      return;
    }
    timer.current = setTimeout(() => latest.current(next), debounceMs);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setLocal('');
    latest.current('');
  }

  return (
    <div className={cn('relative w-full', className)}>
      <Search
        className={cn('text-muted pointer-events-none absolute top-1/2 -translate-y-1/2', size === 'sm' ? 'left-2.5 size-3.5' : 'left-3 size-4')}
        aria-hidden
      />
      <input
        type="search"
        role="searchbox"
        value={local}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && local) {
            e.preventDefault();
            clear();
          }
        }}
        placeholder={placeholder ?? t('ui.search.placeholder')}
        aria-label={props['aria-label'] ?? placeholder ?? t('ui.search.placeholder')}
        className={cn(
          inputClassName,
          '[&::-webkit-search-cancel-button]:appearance-none',
          size === 'sm' ? 'h-8 pl-8 text-sm' : 'pl-9',
          local && 'pr-8',
        )}
        {...props}
      />
      {local ? (
        <button
          type="button"
          onClick={clear}
          aria-label={t('ui.clear')}
          className="text-muted hover:text-text hover:bg-surface-2 absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
