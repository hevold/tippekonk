'use client';
/**
 * FilterBar — a row of filters above a list: optional debounced search,
 * arbitrary controls (NativeSelect, Combobox, …) and a "Nullstill" button
 * that appears when any filter is active.
 *
 *   <FilterBar search={{ value: q, onChange: setQ }} activeCount={active} onReset={reset}>
 *     <NativeSelect size="sm" options={statusOptions} value={status} onChange={…} />
 *   </FilterBar>
 */
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type FilterBarProps = {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    debounceMs?: number;
  };
  /** Number of active filters; shows the reset button when > 0. */
  activeCount?: number;
  onReset?: () => void;
  /** Right-aligned content (e.g. a view toggle or result count). */
  end?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function FilterBar({ search, activeCount = 0, onReset, end, className, children }: FilterBarProps) {
  const t = useT();
  return (
    <div role="search" className={cn('flex flex-wrap items-center gap-2', className)}>
      {search ? (
        <SearchInput
          size="sm"
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder}
          debounceMs={search.debounceMs}
          className="w-full sm:w-64"
        />
      ) : null}
      {children}
      {activeCount > 0 && onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset} leftIcon={<X />}>
          {t('shell.resetFilters')}
          <span className="bg-surface-3 text-muted ml-1 rounded-full px-1.5 text-[11px] leading-4 tabular-nums">
            {activeCount}
          </span>
        </Button>
      ) : null}
      {end ? <div className="ml-auto flex items-center gap-2">{end}</div> : null}
    </div>
  );
}
