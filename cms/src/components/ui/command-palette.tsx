'use client';
/**
 * CommandPalette — ⌘K / Ctrl+K quick navigation and search (cmdk in a Radix
 * Dialog). Static `items` (navigation, actions) are filtered locally; the
 * optional async `search` callback returns e.g. matching articles.
 *
 *   <CommandPalette items={navItems} search={searchArticles} />
 *
 * Controlled (`open`/`onOpenChange`) or uncontrolled. The keyboard shortcut
 * is registered globally unless `hotkey={false}`.
 */
import { Command } from 'cmdk';
import { ArrowRight, CornerDownLeft, FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { Kbd } from './kbd';
import { isModKey, matchesQuery } from './palette-helpers';
import { Spinner } from './spinner';
import { StatusBadge } from './status-badge';

export type PaletteItem = {
  id: string;
  label: string;
  /** Navigate here when selected. */
  href?: string;
  /** Run instead of (or in addition to) navigating. */
  onSelect?: () => void;
  icon?: ReactNode;
  /** Group heading, e.g. "Gå til" / "Handlinger". */
  group?: string;
  /** Extra search terms. */
  keywords?: string[];
  /** Keyboard hint shown on the right. */
  shortcut?: string;
};

export type PaletteSearchResult = {
  id: string;
  title: string;
  description?: string;
  href: string;
  status?: ArticleStatus;
};

export type CommandPaletteProps = {
  items: PaletteItem[];
  /** Async search (min 2 characters, debounced). */
  search?: (query: string) => Promise<PaletteSearchResult[]>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Register ⌘K / Ctrl+K. Default true. */
  hotkey?: boolean;
  placeholder?: string;
  searchGroupLabel?: string;
  debounceMs?: number;
};

const MIN_QUERY = 2;

export function CommandPalette({
  items,
  search,
  open: openProp,
  onOpenChange,
  hotkey = true,
  placeholder,
  searchGroupLabel,
  debounceMs = 200,
}: CommandPaletteProps) {
  const t = useT();
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const [query, setQuery] = useState('');
  // Results are stored with the query they answer, so `searching` can be derived.
  const [answer, setAnswer] = useState<{ query: string; results: PaletteSearchResult[] }>({
    query: '',
    results: [],
  });
  const requestId = useRef(0);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setOpenState(next);
      onOpenChange?.(next);
      if (!next) {
        requestId.current++;
        setQuery('');
        setAnswer({ query: '', results: [] });
      }
    },
    [controlled, onOpenChange],
  );

  useEffect(() => {
    if (!hotkey) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isModKey(e, 'k')) {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hotkey, open, setOpen]);

  const trimmedQuery = query.trim();
  const searchable = Boolean(search) && open && trimmedQuery.length >= MIN_QUERY;
  const results = searchable && answer.query === trimmedQuery ? answer.results : [];
  const searching = searchable && answer.query !== trimmedQuery;

  // Debounced async search with stale-response protection.
  useEffect(() => {
    if (!search || !searchable) return;
    const q = trimmedQuery;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      let found: PaletteSearchResult[] = [];
      try {
        found = await search(q);
      } catch (err) {
        console.error('[ui] palette search failed', err);
      }
      if (requestId.current === id) setAnswer({ query: q, results: found });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [trimmedQuery, searchable, search, debounceMs]);

  const filtered = useMemo(() => items.filter((i) => matchesQuery(i, query)), [items, query]);
  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const key = item.group ?? '';
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [filtered]);

  function run(item: PaletteItem) {
    setOpen(false);
    item.onSelect?.();
    if (item.href) router.push(item.href);
  }

  function go(result: PaletteSearchResult) {
    setOpen(false);
    router.push(result.href);
  }

  const nothing = filtered.length === 0 && results.length === 0 && !searching;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'bg-overlay fixed inset-0 z-50',
            'animate-fade-in data-[state=closed]:animate-fade-out',
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'bg-surface border-border text-text fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border shadow-lg outline-none',
            'animate-slide-down data-[state=closed]:animate-fade-out',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t('ui.palette.title')}</DialogPrimitive.Title>
          <Command shouldFilter={false} loop label={t('ui.palette.title')}>
            <div className="border-border flex items-center gap-2 border-b px-3">
              <Search className="text-muted size-4 shrink-0" aria-hidden />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={placeholder ?? t('ui.palette.placeholder')}
                className="placeholder:text-subtle h-12 w-full bg-transparent text-[15px] outline-none"
              />
              {searching ? <Spinner size="sm" className="text-muted" /> : <Kbd>Esc</Kbd>}
            </div>
            <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto p-1.5">
              {nothing ? (
                <div className="text-muted px-3 py-10 text-center text-sm">
                  {trimmedQuery.length >= MIN_QUERY || !search
                    ? t('ui.palette.empty')
                    : t('ui.palette.typeToSearch', { min: MIN_QUERY })}
                </div>
              ) : null}
              {results.length > 0 ? (
                <Command.Group
                  heading={searchGroupLabel ?? t('ui.palette.results')}
                  className="[&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
                >
                  {results.map((r) => (
                    <Command.Item
                      key={`result-${r.id}`}
                      value={`result-${r.id}`}
                      onSelect={() => go(r)}
                      className={paletteItemClass}
                    >
                      <FileText className="text-muted size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{r.title}</span>
                        {r.description ? (
                          <span className="text-muted block truncate text-xs">{r.description}</span>
                        ) : null}
                      </span>
                      {r.status ? <StatusBadge status={r.status} /> : null}
                      <CornerDownLeft
                        className="text-subtle size-3.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100"
                        aria-hidden
                      />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              {groups.map(([group, list]) => (
                <Command.Group
                  key={group || '__default'}
                  heading={group || undefined}
                  className="[&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
                >
                  {list.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      onSelect={() => run(item)}
                      className={paletteItemClass}
                    >
                      <span
                        className="text-muted flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
                        aria-hidden
                      >
                        {item.icon ?? <ArrowRight />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.shortcut ? <Kbd>{item.shortcut}</Kbd> : null}
                      <CornerDownLeft
                        className="text-subtle size-3.5 shrink-0 opacity-0 group-data-[selected=true]:opacity-100"
                        aria-hidden
                      />
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
            <div className="border-border text-subtle flex items-center gap-3 border-t px-3 py-2 text-[11px]">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> {t('ui.palette.navigate')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>↵</Kbd> {t('ui.palette.select')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Esc</Kbd> {t('ui.close')}
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const paletteItemClass = cn(
  'group relative flex cursor-default items-center gap-2.5 rounded-md px-2 py-2 text-sm outline-none select-none',
  'data-[selected=true]:bg-surface-2 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
);
