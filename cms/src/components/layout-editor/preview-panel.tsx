'use client';
/**
 * Live preview of the draft: resolves the document on the server (pinned
 * items first, then auto-fill, with dedupe) and shows the resulting teasers
 * with thumbnails, row by row. Refreshes while open when the draft changes.
 */
import { ImageIcon, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { formatRelative } from '@/lib/dates';
import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import type { LayoutDoc } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { previewLayoutAction } from '@/server/layouts/actions';
import type { PreviewBlock, PreviewLayout, PreviewTeaser } from '@/server/layouts/preview';

export type PreviewPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: LayoutDoc;
  title: string;
};

const REFRESH_DELAY_MS = 700;

export function PreviewPanel({ open, onOpenChange, doc, title }: PreviewPanelProps) {
  const t = useT();
  const [preview, setPreview] = useState<PreviewLayout | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const timer = setTimeout(
      () => {
        setLoading(true);
        previewLayoutAction({ doc })
          .then((res) => {
            if (id !== requestId.current) return;
            if (res.ok) {
              setPreview(res.data);
              setError(null);
            } else {
              setError(res.error);
            }
          })
          .finally(() => {
            if (id === requestId.current) setLoading(false);
          });
      },
      preview ? REFRESH_DELAY_MS : 0,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, doc]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('layout.preview.title', { name: title })}
      description={t('layout.preview.description')}
      size="xl"
    >
      <div aria-busy={loading} className="relative flex flex-col gap-6">
        {loading ? (
          <div className="bg-surface/70 absolute inset-0 z-10 flex items-start justify-center pt-10">
            <Spinner label={t('common.loading')} />
          </div>
        ) : null}
        {error ? <p className="text-danger text-sm">{error}</p> : null}
        {!preview && !error ? null : preview && preview.rows.length === 0 ? (
          <p className="text-muted py-10 text-center text-sm">{t('layout.preview.empty')}</p>
        ) : (
          preview?.rows.map((row, i) => (
            <section
              key={row.id}
              aria-label={row.title ?? t('layout.editor.rowN', { n: i + 1 })}
              className={cn(
                'rounded-lg p-3',
                row.background === 'muted' && 'bg-surface-2',
                row.background === 'accent' && 'bg-primary-soft/50',
              )}
            >
              {row.title ? <h3 className="mb-2 text-base font-semibold">{row.title}</h3> : null}
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
              >
                {row.blocks.map((block) => (
                  <PreviewBlockView key={block.id} block={block} columns={row.columns} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Sheet>
  );
}

function PreviewBlockView({ block, columns }: { block: PreviewBlock; columns: number }) {
  const t = useT();
  const def = BLOCK_DEFINITIONS[block.type];
  const span = Math.min(block.span, columns);
  const isStatic = !def.autoFills && !def.supportsItems;
  return (
    <div
      className="border-border bg-surface min-w-0 rounded-md border p-3"
      style={{ gridColumn: `span ${span} / span ${span}` }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold">{block.title ?? def.label}</span>
        <Badge variant="muted">{def.label}</Badge>
      </div>
      {block.type === 'live' ? (
        block.liveBlogs.length ? (
          <ul className="flex flex-col gap-1">
            {block.liveBlogs.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                <Radio className="text-danger size-3.5" aria-hidden />
                {l.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-xs">{t('layout.preview.noLive')}</p>
        )
      ) : isStatic ? (
        <p className="text-muted text-xs">{t('layout.preview.static')}</p>
      ) : block.articles.length === 0 ? (
        <p className="text-muted text-xs">{t('layout.preview.noArticles')}</p>
      ) : (
        <ol
          className={cn('grid gap-3', block.type === 'hero' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2')}
        >
          {block.articles.map((a, i) => (
            <PreviewTeaserView
              key={a.id}
              article={a}
              large={block.type === 'hero' || (block.type === 'top-stories' && i === 0)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function PreviewTeaserView({ article, large }: { article: PreviewTeaser; large: boolean }) {
  const t = useT();
  return (
    <li className={cn('flex gap-3', large && 'flex-col')}>
      {article.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.imageUrl}
          alt={article.imageAlt ?? ''}
          className={cn(
            'bg-surface-2 shrink-0 rounded object-cover',
            large ? 'aspect-video w-full' : 'size-14',
          )}
        />
      ) : (
        <span
          className={cn(
            'bg-surface-2 text-subtle flex shrink-0 items-center justify-center rounded',
            large ? 'aspect-video w-full' : 'size-14',
          )}
        >
          <ImageIcon className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        {article.kicker ? (
          <p className="text-primary text-[11px] font-semibold tracking-wide uppercase">{article.kicker}</p>
        ) : null}
        <p className={cn('font-medium', large ? 'text-base' : 'text-sm')}>{article.title}</p>
        {large && article.lead ? <p className="text-muted text-sm">{article.lead}</p> : null}
        <p className="text-muted mt-0.5 flex flex-wrap gap-1 text-xs">
          {article.pinned ? <Badge variant="info">{t('layout.preview.pinned')}</Badge> : null}
          {article.status === 'scheduled' ? (
            <Badge variant="warning">{t('common.status.scheduled')}</Badge>
          ) : null}
          {article.access === 'plus' ? <Badge variant="default">{t('common.plus')}</Badge> : null}
          {article.isBreaking ? <Badge variant="danger">{t('common.breaking')}</Badge> : null}
          {article.sectionName ? <span>{article.sectionName}</span> : null}
          {article.publishedAt ? <span>· {formatRelative(article.publishedAt)}</span> : null}
          {article.bylines.length ? <span>· {article.bylines.join(', ')}</span> : null}
        </p>
      </div>
    </li>
  );
}
