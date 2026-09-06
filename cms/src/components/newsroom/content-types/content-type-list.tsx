'use client';
/**
 * ContentTypeList — table of the site's content types with icon, key,
 * template, field and article counts, default/active badges, and per-row
 * actions: edit, make default, delete (refused while articles use the type;
 * the dialog explains how to change their type first).
 */
import { Blocks, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { formatNumber } from '@/components/ui/format';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { deleteContentTypeAction, setDefaultContentTypeAction } from '@/server/content-types/actions';

import { ContentTypeIcon } from './icons';
import type { ContentTypeDto } from './types';

export type ContentTypeListProps = { contentTypes: ContentTypeDto[] };

type DialogState =
  { kind: 'delete'; contentType: ContentTypeDto } | { kind: 'inUse'; contentType: ContentTypeDto } | null;

const editHref = (id: string) => `${adminPaths.contentTypes()}/${id}`;
const newHref = `${adminPaths.contentTypes()}/ny`;

export function ContentTypeList({ contentTypes }: ContentTypeListProps) {
  const t = useT();
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function makeDefault(ct: ContentTypeDto) {
    setBusyId(ct.id);
    const result = await setDefaultContentTypeAction(ct.id);
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('contentTypes.toast.defaultSet', { name: ct.name }));
  }

  async function remove(ct: ContentTypeDto) {
    const result = await deleteContentTypeAction(ct.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('contentTypes.toast.deleted', { name: ct.name }));
  }

  const columns: ColumnDef<ContentTypeDto>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="border-border bg-surface-2 text-muted inline-flex size-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4">
            <ContentTypeIcon name={row.icon} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={editHref(row.id)}
                className={cn(
                  'focus-visible:outline-ring truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                  !row.isActive && 'text-muted',
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {row.name}
              </Link>
              {row.isDefault ? (
                <Badge variant="info" className="gap-1">
                  <Star className="size-3" aria-hidden />
                  {t('contentTypes.default')}
                </Badge>
              ) : null}
              {!row.isActive ? <Badge variant="muted">{t('taxonomy.inactive')}</Badge> : null}
            </div>
            <p className="text-subtle truncate font-mono text-xs">{row.key}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: t('common.description'),
      hideBelow: 'lg',
      cell: (row) => <span className="text-muted line-clamp-2 max-w-[24rem]">{row.description ?? '–'}</span>,
    },
    {
      key: 'template',
      header: t('contentTypes.column.template'),
      hideBelow: 'md',
      width: 120,
      cell: (row) => <span className="text-muted">{t(`contentTypes.template.${row.template}`)}</span>,
    },
    {
      key: 'fields',
      header: t('contentTypes.column.fields'),
      align: 'right',
      width: 80,
      cell: (row) => <span className="tabular-nums">{formatNumber(row.fieldCount)}</span>,
    },
    {
      key: 'articles',
      header: t('taxonomy.articles'),
      align: 'right',
      width: 90,
      cell: (row) => (
        <a
          href={`${adminPaths.articles()}?contentTypeId=${row.id}`}
          className="focus-visible:outline-ring rounded-sm tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {formatNumber(row.articleCount)}
        </a>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      width: 44,
      align: 'right',
      cell: (row) => (
        <span
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="inline-flex"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                label={t('taxonomy.actionsFor', { name: row.name })}
                size="sm"
                disabled={busyId === row.id}
              >
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild icon={<Pencil />}>
                <Link href={editHref(row.id)}>{t('common.edit')}</Link>
              </DropdownMenuItem>
              {!row.isDefault ? (
                <DropdownMenuItem
                  icon={<Star />}
                  disabled={!row.isActive}
                  onSelect={() => void makeDefault(row)}
                >
                  {t('contentTypes.action.makeDefault')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<Trash2 />}
                destructive
                disabled={row.isDefault}
                onSelect={() =>
                  setDialog(
                    row.articleCount > 0
                      ? { kind: 'inUse', contentType: row }
                      : { kind: 'delete', contentType: row },
                  )
                }
              >
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-sm tabular-nums">
          {t('contentTypes.count', { count: contentTypes.length })}
        </span>
        <Button asChild>
          <Link href={newHref}>
            <Plus />
            {t('contentTypes.new')}
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={contentTypes}
        rowKey="id"
        caption={t('contentTypes.caption')}
        onRowClick={(row) => router.push(editHref(row.id))}
        emptyState={
          <EmptyState
            icon={<Blocks />}
            title={t('contentTypes.empty.title')}
            description={t('contentTypes.empty.description')}
            compact
            action={
              <Button asChild size="sm">
                <Link href={newHref}>
                  <Plus />
                  {t('contentTypes.new')}
                </Link>
              </Button>
            }
          />
        }
      />

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === 'delete' ? t('contentTypes.delete.title', { name: dialog.contentType.name }) : ''
        }
        description={t('contentTypes.delete.description')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (dialog?.kind === 'delete') await remove(dialog.contentType);
        }}
      />

      {dialog?.kind === 'inUse' ? (
        <Dialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t('contentTypes.inUse.title', { name: dialog.contentType.name })}
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setDialog(null)}>
                {t('common.close')}
              </Button>
              <Button asChild>
                <Link href={`${adminPaths.articles()}?contentTypeId=${dialog.contentType.id}`}>
                  {t('contentTypes.inUse.showArticles')}
                </Link>
              </Button>
            </>
          }
        >
          <Alert variant="warning">
            {t('contentTypes.inUse.body', { count: dialog.contentType.articleCount })}
          </Alert>
          <p className="text-muted mt-3 text-sm">{t('contentTypes.inUse.howTo')}</p>
        </Dialog>
      ) : null}
    </div>
  );
}
