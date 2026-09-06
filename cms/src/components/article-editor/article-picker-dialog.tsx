'use client';
/**
 * ArticlePickerDialog — search the site's articles and pick one. Used for
 * "Relaterte saker", the editor's "Les også" blocks and custom fields of
 * type `article`. Search goes through searchArticlesForPickerAction.
 *
 *   <ArticlePickerDialog open onOpenChange onSelect={(a) => …} excludeIds={[id]} />
 */
import { FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { searchArticlesForPickerAction } from '@/server/articles/actions';
import type { PickerArticle } from '@/server/articles/queries';

export type ArticlePickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (article: PickerArticle) => void;
  /** Ids that are already chosen (shown disabled). */
  excludeIds?: string[];
  /** The article being edited (never offered). */
  currentId?: string;
  publishedOnly?: boolean;
  title?: string;
};

export function ArticlePickerDialog({
  open,
  onOpenChange,
  onSelect,
  excludeIds = [],
  currentId,
  publishedOnly = false,
  title,
}: ArticlePickerDialogProps) {
  const t = useT();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickerArticle[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Query key the current `items` were loaded for; differs from `queryKey` while a fetch is pending. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const requestId = useRef(0);

  const queryKey = JSON.stringify([session, q, currentId ?? '', publishedOnly]);
  const loading = open && loadedKey !== queryKey;

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    void searchArticlesForPickerAction({ q, excludeId: currentId ?? null, publishedOnly, limit: 30 }).then((res) => {
      if (id !== requestId.current) return;
      if (res.ok) {
        setItems(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoadedKey(queryKey);
    });
  }, [open, q, currentId, publishedOnly, queryKey]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQ('');
    } else {
      // Re-run the search on every open so a freshly created article shows up.
      setSession((n) => n + 1);
    }
    onOpenChange(next);
  }

  const excluded = new Set(excludeIds);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} title={title ?? t('articles.picker.title')} size="lg">
      <div className="grid gap-3 pb-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={t('articles.picker.search')}
          aria-label={t('articles.picker.search')}
          autoFocus
        />
        <div className="border-border max-h-[50vh] min-h-40 overflow-y-auto rounded-md border" aria-busy={loading}>
          {error ? (
            <p className="text-danger p-4 text-sm">{error}</p>
          ) : loading && items.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <Spinner label={t('articles.picker.loading')} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState compact icon={<FileText />} title={t('articles.picker.empty')} />
          ) : (
            <ul role="list" className="divide-border divide-y">
              {items.map((item) => {
                const taken = excluded.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => {
                        onSelect(item);
                        handleOpenChange(false);
                      }}
                      className={cn(
                        'hover:bg-surface-2 focus-visible:outline-ring flex w-full items-center gap-3 px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2',
                        taken && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-text block truncate font-medium">{item.title}</span>
                        {item.sectionName ? (
                          <span className="text-muted block truncate text-xs">{item.sectionName}</span>
                        ) : null}
                      </span>
                      <StatusBadge status={item.status} />
                      {taken ? <span className="text-muted text-xs">{t('articles.picker.alreadyAdded')}</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
