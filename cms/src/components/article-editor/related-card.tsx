'use client';
/**
 * RelatedCard ("Relaterte saker") — ordered list of related articles with a
 * search picker to add more. Titles for known ids come from the model;
 * newly picked ones are cached locally.
 */
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import type { EditorRelated, PickerArticle } from '@/server/articles/queries';

import { ArticlePickerDialog } from './article-picker-dialog';

export type RelatedCardProps = {
  relatedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  known: EditorRelated[];
  currentId: string;
  onResolved: (article: EditorRelated) => void;
};

export function RelatedCard({
  relatedIds,
  onChange,
  disabled,
  known,
  currentId,
  onResolved,
}: RelatedCardProps) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const byId = new Map(known.map((k) => [k.id, k]));

  function move(index: number, delta: number) {
    const next = [...relatedIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  }

  return (
    <div className="grid gap-3">
      {relatedIds.length === 0 ? (
        <p className="text-muted text-sm">{t('articles.related.empty')}</p>
      ) : (
        <ol className="grid gap-2">
          {relatedIds.map((id, index) => {
            const item = byId.get(id);
            return (
              <li
                key={id}
                className="border-border flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <Link
                    href={adminPaths.article(id)}
                    className="text-text block truncate hover:underline"
                    target="_blank"
                  >
                    {item?.title || t('articles.related.unknown')}
                  </Link>
                  {item ? <StatusBadge status={item.status} compact className="text-xs" /> : null}
                </span>
                {!disabled ? (
                  <>
                    <IconButton
                      size="sm"
                      label={t('articles.related.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label={t('articles.related.moveDown')}
                      disabled={index === relatedIds.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label={t('articles.related.remove')}
                      onClick={() => onChange(relatedIds.filter((r) => r !== id))}
                    >
                      <X />
                    </IconButton>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      {!disabled ? (
        <Button size="sm" variant="outline" leftIcon={<Plus />} onClick={() => setPicking(true)}>
          {t('articles.related.add')}
        </Button>
      ) : null}
      <ArticlePickerDialog
        open={picking}
        onOpenChange={setPicking}
        currentId={currentId}
        excludeIds={relatedIds}
        onSelect={(article: PickerArticle) => {
          onResolved({ id: article.id, title: article.title, status: article.status });
          if (!relatedIds.includes(article.id)) onChange([...relatedIds, article.id]);
        }}
      />
    </div>
  );
}
