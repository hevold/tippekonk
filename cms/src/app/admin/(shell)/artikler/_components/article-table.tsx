'use client';
/**
 * ArticleTable — the list itself: selectable rows, sortable columns (sort is
 * written to the URL), row click opens the editor, a "…" menu per row and a
 * bulk bar for the selection. Rows arrive serialised from the server page.
 */
import { Archive, FileText, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';

import { ArticleFlags } from '@/components/newsroom/article-flags';
import { Deadline } from '@/components/newsroom/deadline';
import { listHref, withQuery, type ListQuery } from '@/components/newsroom/list-url';
import { StatusPill } from '@/components/newsroom/status-pill';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef, type SortState } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatNumber, formatRelative } from '@/components/ui/format';
import { Pagination } from '@/components/ui/pagination';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { ACTION_LABEL_KEY, availableActions, RowActions, runRowAction, type RowActionKind } from './row-actions';
import type { ArticleRowDto, ListPermissions } from './types';

export type ArticleTableProps = {
  rows: ArticleRowDto[];
  query: ListQuery;
  page: number;
  pageCount: number;
  total: number;
  perm: ListPermissions;
  /** True when no filter but the status tab is active (drives the empty state copy). */
  filtered: boolean;
  trashView: boolean;
};

const SORT_KEYS = new Set(['title', 'updatedAt', 'publishedAt', 'deadlineAt']);
const BULK_KINDS: RowActionKind[] = ['sendToDesk', 'archive', 'trash', 'restore', 'destroy'];
const BULK_ICON: Partial<Record<RowActionKind, ReactNode>> = {
  sendToDesk: <Send />,
  archive: <Archive />,
  trash: <Trash2 />,
  restore: <RotateCcw />,
  destroy: <Trash2 />,
};

function parseSort(sort: string | undefined): SortState | undefined {
  if (!sort) return { key: 'updatedAt', dir: 'desc' };
  const key = sort.replace(/^-/, '');
  return SORT_KEYS.has(key) ? { key, dir: sort.startsWith('-') ? 'desc' : 'asc' } : undefined;
}

export function ArticleTable({ rows, query, page, pageCount, total, perm, filtered, trashView }: ArticleTableProps) {
  const t = useT();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState<RowActionKind | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Drop selections that are no longer on the page (after refresh/pagination).
  const visibleSelected = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    return new Set([...selected].filter((id) => ids.has(id)));
  }, [rows, selected]);
  const selectedRows = rows.filter((r) => visibleSelected.has(r.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }
  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Bulk actions available to every selected row. */
  const bulkActions = useMemo(() => {
    if (selectedRows.length === 0) return [];
    return BULK_KINDS.filter((kind) => selectedRows.every((r) => availableActions(r, perm).has(kind)));
  }, [selectedRows, perm]);

  async function performBulk(kind: RowActionKind) {
    setBulkBusy(true);
    try {
      const results = await Promise.all(selectedRows.map((r) => runRowAction(kind, r.id)));
      const failed = results.filter((r) => !r.ok);
      const okCount = results.length - failed.length;
      if (okCount > 0) toast.success(t('list.bulk.done', { count: okCount, action: t(ACTION_LABEL_KEY[kind]) }));
      if (failed.length > 0) {
        const first = failed[0];
        toast.error(t('list.bulk.failed', { count: failed.length }) + (first && !first.ok ? ` ${first.error}` : ''));
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  }

  const sort = parseSort(query.sort);
  function onSortChange(next: SortState) {
    router.replace(listHref(withQuery(query, { sort: `${next.dir === 'desc' ? '-' : ''}${next.key}` })), { scroll: false });
  }

  const columns: ColumnDef<ArticleRowDto>[] = [
    {
      key: 'select',
      width: 36,
      header: (
        <Checkbox
          aria-label={t('list.selectAll')}
          checked={allSelected ? true : selectedRows.length > 0 ? 'indeterminate' : false}
          onCheckedChange={(v) => toggleAll(v === true)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      cell: (row) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={t('list.selectRow', { title: row.title.trim() || t('list.untitled') })}
            checked={visibleSelected.has(row.id)}
            onCheckedChange={(v) => toggleOne(row.id, v === true)}
          />
        </span>
      ),
      className: 'pr-0',
      headerClassName: 'pr-0',
    },
    {
      key: 'title',
      header: t('list.column.title'),
      sortable: true,
      cell: (row) => (
        <div className="min-w-0 max-w-[32rem]">
          {row.kicker ? <p className="text-muted truncate text-xs">{row.kicker}</p> : null}
          <div className="flex items-center gap-2">
            <Link
              href={adminPaths.article(row.id)}
              className={cn('truncate font-medium hover:underline', !row.title.trim() && 'text-muted italic')}
              onClick={(e) => e.stopPropagation()}
            >
              {row.title.trim() || t('list.untitled')}
            </Link>
            <ArticleFlags access={row.access} isBreaking={row.isBreaking} isSponsored={row.isSponsored} />
          </div>
          {row.contentTypeName ? <p className="text-subtle text-xs md:hidden">{row.contentTypeName}</p> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('list.column.status'),
      width: 120,
      cell: (row) => (
        <div className="grid gap-0.5">
          <StatusPill status={row.status} />
          {row.status === 'scheduled' && row.scheduledAt ? (
            <span className="text-subtle text-xs whitespace-nowrap">{formatRelative(row.scheduledAt, now)}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'section',
      header: t('list.column.section'),
      hideBelow: 'md',
      cell: (row) => (
        <div className="grid gap-0.5">
          <span className="text-text truncate">{row.sectionName ?? <span className="text-subtle">–</span>}</span>
          {row.contentTypeName ? <span className="text-subtle text-xs">{row.contentTypeName}</span> : null}
        </div>
      ),
    },
    {
      key: 'bylines',
      header: t('list.column.bylines'),
      hideBelow: 'lg',
      cell: (row) =>
        row.bylines.length ? (
          <span className="text-muted line-clamp-2">{row.bylines.map((b) => b.name).join(', ')}</span>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: 'updatedAt',
      header: t('list.column.updated'),
      sortable: true,
      hideBelow: 'sm',
      cell: (row) => (
        <div className="grid gap-0.5 whitespace-nowrap">
          <time dateTime={row.updatedAt} title={formatDateTime(row.updatedAt)} className="text-muted">
            {formatRelative(row.updatedAt, now)}
          </time>
          {row.updatedByName ? <span className="text-subtle text-xs">{row.updatedByName}</span> : null}
        </div>
      ),
    },
    {
      key: 'publishedAt',
      header: t('list.column.published'),
      sortable: true,
      hideBelow: 'lg',
      cell: (row) =>
        row.publishedAt ? (
          <time dateTime={row.publishedAt} className="text-muted whitespace-nowrap">
            {formatDateTime(row.publishedAt)}
          </time>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: 'deadlineAt',
      header: t('list.column.assigned'),
      sortable: true,
      hideBelow: 'xl',
      cell: (row) => (
        <div className="grid gap-0.5">
          <span className={cn('truncate', row.assignedToName ? 'text-text' : 'text-subtle')}>
            {row.assignedToName ?? t('list.unassigned')}
          </span>
          <Deadline deadlineAt={row.deadlineAt} status={row.status} now={now} className="text-xs" />
        </div>
      ),
    },
    {
      key: 'wordCount',
      header: t('list.column.words'),
      align: 'right',
      hideBelow: 'xl',
      width: 80,
      cell: (row) => <span className="text-muted tabular-nums">{formatNumber(row.wordCount)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      width: 44,
      align: 'right',
      cell: (row) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
          <RowActions row={row} perm={perm} />
        </span>
      ),
    },
  ];

  const emptyState = trashView ? (
    <EmptyState icon={<Trash2 />} title={t('list.empty.trash.title')} description={t('list.empty.trash.description')} compact />
  ) : filtered ? (
    <EmptyState
      icon={<FileText />}
      title={t('list.empty.filtered.title')}
      description={t('list.empty.filtered.description')}
      compact
      action={
        <Button asChild variant="outline" size="sm">
          <Link href={listHref({})}>{t('list.empty.filtered.reset')}</Link>
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<FileText />}
      title={t('list.empty.title')}
      description={t('list.empty.description')}
      compact
      action={
        perm.create ? (
          <Button asChild size="sm">
            <Link href={adminPaths.newArticle()}>
              <Plus />
              {t('list.new')}
            </Link>
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="grid gap-3">
      {selectedRows.length > 0 ? (
        <div
          role="region"
          aria-label={t('list.bulk.region')}
          className="bg-primary-soft border-primary/20 flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span className="text-primary font-medium tabular-nums">{t('list.bulk.selected', { count: selectedRows.length })}</span>
          {bulkActions.map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant={kind === 'destroy' || kind === 'trash' ? 'danger' : 'outline'}
              leftIcon={BULK_ICON[kind]}
              disabled={bulkBusy}
              onClick={() => (kind === 'sendToDesk' ? void performBulk(kind) : setBulkConfirm(kind))}
            >
              {t(ACTION_LABEL_KEY[kind])}
            </Button>
          ))}
          {bulkActions.length === 0 ? <span className="text-muted">{t('list.bulk.none')}</span> : null}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            {t('list.bulk.clear')}
          </Button>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        sort={sort}
        onSortChange={onSortChange}
        onRowClick={(row) => router.push(adminPaths.article(row.id))}
        isSelected={(row) => visibleSelected.has(row.id)}
        emptyState={emptyState}
        caption={t('list.caption', { count: total })}
      />

      <Pagination page={page} pageCount={pageCount} hrefFor={(p) => listHref({ ...query, page: String(p) })} />

      <ConfirmDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => !open && setBulkConfirm(null)}
        title={bulkConfirm ? t(`list.confirm.${bulkConfirm}.title`) : ''}
        description={bulkConfirm ? t('list.bulk.confirm', { count: selectedRows.length }) : ''}
        confirmLabel={bulkConfirm ? t(ACTION_LABEL_KEY[bulkConfirm]) : undefined}
        destructive={bulkConfirm === 'destroy' || bulkConfirm === 'trash'}
        onConfirm={async () => {
          if (bulkConfirm) await performBulk(bulkConfirm);
        }}
      />
    </div>
  );
}
