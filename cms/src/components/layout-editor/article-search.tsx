'use client';
/**
 * Search panel: find published and scheduled articles by title and pin them
 * to the selected block with a button, or drag a result onto any block on
 * the canvas.
 */
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ImageIcon, Pin } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatRelative } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { searchLayoutArticlesAction, type LayoutArticleInfo } from '@/server/layouts/actions';

import { dragId } from './dnd-announcements';

export type ArticleSearchProps = {
  /** Block that receives "Fest" clicks (null when none is selected). */
  targetBlockLabel: string | null;
  canPinToTarget: boolean;
  pinnedIds: Set<string>;
  disabled?: boolean;
  onPin: (articleId: string) => void;
  onResults: (results: LayoutArticleInfo[]) => void;
};

export function ArticleSearch({
  targetBlockLabel,
  canPinToTarget,
  pinnedIds,
  disabled,
  onPin,
  onResults,
}: ArticleSearchProps) {
  const t = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LayoutArticleInfo[]>([]);
  const [loadedQ, setLoadedQ] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);
  const loading = loadedQ !== q;

  useEffect(() => {
    const id = ++requestId.current;
    void searchLayoutArticlesAction({ q, limit: 30 }).then((res) => {
      if (id !== requestId.current) return;
      if (res.ok) {
        setResults(res.data);
        setError(null);
        onResultsRef.current(res.data);
      } else {
        setError(res.error);
      }
      setLoadedQ(q);
    });
  }, [q]);

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder={t('layout.search.placeholder')}
        aria-label={t('layout.search.label')}
      />
      <p className="text-muted text-xs">
        {targetBlockLabel
          ? canPinToTarget
            ? t('layout.search.target', { block: targetBlockLabel })
            : t('layout.search.targetUnsupported', { block: targetBlockLabel })
          : t('layout.search.noTarget')}
      </p>
      {error ? <p className="text-danger text-sm">{error}</p> : null}
      {loading && results.length === 0 ? (
        <div className="flex justify-center py-6">
          <Spinner label={t('common.loading')} />
        </div>
      ) : results.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">{t('layout.search.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-busy={loading}>
          {results.map((a) => (
            <SearchResult
              key={a.id}
              article={a}
              alreadyPinned={pinnedIds.has(a.id)}
              canPin={canPinToTarget && !disabled}
              onPin={onPin}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchResult({
  article,
  alreadyPinned,
  canPin,
  onPin,
}: {
  article: LayoutArticleInfo;
  alreadyPinned: boolean;
  canPin: boolean;
  onPin: (id: string) => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: dragId('search', article.id),
    data: { kind: 'search', article },
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform) };
  const when = article.publishedAt ?? article.scheduledAt;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-surface border-border flex items-center gap-1.5 rounded-md border p-1.5',
        isDragging && 'opacity-60 shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={cn(
          'text-subtle hover:text-text hover:bg-surface-2 flex size-7 shrink-0 cursor-grab items-center justify-center rounded',
          'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
        )}
        aria-label={t('layout.search.drag', { title: article.title })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      {article.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.thumbnailUrl}
          alt=""
          className="bg-surface-2 size-9 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="bg-surface-2 text-subtle flex size-9 shrink-0 items-center justify-center rounded">
          <ImageIcon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{article.title}</p>
        <p className="text-muted flex flex-wrap items-center gap-1 text-xs">
          <StatusBadge status={article.status} compact />
          {article.sectionName ? <span>{article.sectionName}</span> : null}
          {when ? <span>· {formatRelative(when)}</span> : null}
          {article.access === 'plus' ? <span>· {t('common.plus')}</span> : null}
          {article.isSponsored ? <span>· {t('common.sponsored')}</span> : null}
        </p>
      </div>
      <Button
        variant={alreadyPinned ? 'ghost' : 'outline'}
        size="sm"
        leftIcon={<Pin />}
        disabled={!canPin || alreadyPinned}
        onClick={() => onPin(article.id)}
      >
        {alreadyPinned ? t('layout.search.pinned') : t('layout.search.pin')}
      </Button>
    </li>
  );
}
