'use client';
/**
 * TagList — the tags admin: search (in the URL), sort, a table with article
 * counts, and per-row edit / merge / delete. Create and edit run in
 * <TagDialog>, merge in <TagMergeDialog>; deletion confirms first and warns
 * about the number of articles that lose the tag.
 */
import { GitMerge, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { FilterBar } from '@/components/admin/filter-bar';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatNumber } from '@/components/ui/format';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { adminPaths, publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { deleteTagAction } from '@/server/taxonomy/actions';
import type { ListTagsOptions } from '@/server/taxonomy/queries';

import { TagDialog } from './tag-dialog';
import { TagMergeDialog } from './tag-merge-dialog';
import type { TagDto } from './types';

export type TagSort = NonNullable<ListTagsOptions['sort']>;

export type TagListProps = {
  tags: TagDto[];
  /** Every tag regardless of the search (merge targets). */
  all: TagDto[];
  q: string;
  sort: TagSort;
};

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; tag: TagDto }
  | { kind: 'merge'; tag: TagDto }
  | { kind: 'delete'; tag: TagDto }
  | null;

const SORTS: TagSort[] = ['name', 'count', 'newest'];

export function TagList({ tags, all, q, sort }: TagListProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);

  function navigate(next: { q?: string; sort?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.sort ?? sort;
    if (nq) params.set('q', nq);
    if (ns && ns !== 'name') params.set('sort', ns);
    const qs = params.toString();
    startTransition(() =>
      router.replace(qs ? `${adminPaths.tags()}?${qs}` : adminPaths.tags(), { scroll: false }),
    );
  }

  async function remove(tag: TagDto) {
    const result = await deleteTagAction(tag.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('taxonomy.tags.toast.deleted', { name: tag.name }));
  }

  const columns: ColumnDef<TagDto>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div className="min-w-0">
          <button
            type="button"
            className="focus-visible:outline-ring truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={() => setDialog({ kind: 'edit', tag: row })}
          >
            {row.name}
          </button>
          <p className="text-subtle font-mono text-xs">
            <a href={publicPaths.tag(row.slug)} target="_blank" rel="noreferrer" className="hover:underline">
              {publicPaths.tag(row.slug)}
            </a>
          </p>
        </div>
      ),
    },
    {
      key: 'description',
      header: t('common.description'),
      hideBelow: 'md',
      cell: (row) => <span className="text-muted line-clamp-2 max-w-[28rem]">{row.description ?? '–'}</span>,
    },
    {
      key: 'count',
      header: t('taxonomy.articles'),
      align: 'right',
      width: 100,
      cell: (row) => (
        <a
          href={`${adminPaths.articles()}?tagId=${row.id}`}
          className="focus-visible:outline-ring rounded-sm tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          title={t('taxonomy.tags.showArticles')}
        >
          {formatNumber(row.articleCount)}
        </a>
      ),
    },
    {
      key: 'createdAt',
      header: t('common.created'),
      hideBelow: 'lg',
      width: 130,
      cell: (row) => <span className="text-muted whitespace-nowrap">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      width: 44,
      align: 'right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label={t('taxonomy.actionsFor', { name: row.name })} size="sm">
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog({ kind: 'edit', tag: row })}>
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={<GitMerge />}
              onSelect={() => setDialog({ kind: 'merge', tag: row })}
              disabled={all.length < 2}
            >
              {t('taxonomy.tags.merge.action')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<Trash2 />}
              destructive
              onSelect={() => setDialog({ kind: 'delete', tag: row })}
            >
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <FilterBar
        search={{
          value: q,
          onChange: (value) => navigate({ q: value }),
          placeholder: t('taxonomy.tags.searchPlaceholder'),
        }}
        activeCount={q ? 1 : 0}
        onReset={() => navigate({ q: '' })}
        end={
          <div className="flex items-center gap-2">
            {pending ? <Spinner size="sm" label={t('common.loading')} /> : null}
            <span className="text-muted text-sm tabular-nums" aria-live="polite">
              {t('taxonomy.tags.count', { count: tags.length })}
            </span>
            <Label htmlFor="tags-sort" className="sr-only">
              {t('taxonomy.sort')}
            </Label>
            <NativeSelect
              id="tags-sort"
              size="sm"
              className="w-40"
              value={sort}
              onChange={(e) => navigate({ sort: e.target.value })}
              options={SORTS.map((s) => ({ value: s, label: t(`taxonomy.tags.sort.${s}`) }))}
            />
            <Button size="sm" onClick={() => setDialog({ kind: 'create' })} leftIcon={<Plus />}>
              {t('taxonomy.tags.new')}
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        rows={tags}
        rowKey="id"
        caption={t('taxonomy.tags.caption')}
        emptyState={
          q ? (
            <EmptyState
              icon={<Tags />}
              title={t('taxonomy.tags.empty.filtered')}
              description={t('taxonomy.tags.empty.filteredDescription')}
              compact
              action={
                <Button size="sm" variant="outline" onClick={() => navigate({ q: '' })}>
                  {t('taxonomy.tags.empty.reset')}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Tags />}
              title={t('taxonomy.tags.empty.title')}
              description={t('taxonomy.tags.empty.description')}
              compact
              action={
                <Button size="sm" onClick={() => setDialog({ kind: 'create' })} leftIcon={<Plus />}>
                  {t('taxonomy.tags.new')}
                </Button>
              }
            />
          )
        }
      />

      {dialog?.kind === 'create' ? (
        <TagDialog open onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <TagDialog open onOpenChange={(open) => !open && setDialog(null)} tag={dialog.tag} />
      ) : null}
      {dialog?.kind === 'merge' ? (
        <TagMergeDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          source={dialog.tag}
          all={all}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={dialog?.kind === 'delete' ? t('taxonomy.tags.delete.title', { name: dialog.tag.name }) : ''}
        description={
          dialog?.kind === 'delete'
            ? dialog.tag.articleCount > 0
              ? t('taxonomy.tags.delete.hasArticles', { count: dialog.tag.articleCount })
              : t('taxonomy.tags.delete.empty')
            : ''
        }
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (dialog?.kind === 'delete') await remove(dialog.tag);
        }}
      />
    </div>
  );
}
