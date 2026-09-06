'use client';
/**
 * AuthorList — the bylines admin: photo, name and title, contact details,
 * linked user, article count, an active switch and up/down ordering (the
 * public "Skribenter" order). Rows open <AuthorDialog>; deletion is refused
 * by the service while bylines reference the author.
 */
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, PenLine, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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
import { formatNumber } from '@/components/ui/format';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { adminPaths, publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { deleteAuthorAction, reorderAuthorsAction, setAuthorActiveAction } from '@/server/taxonomy/actions';

import { AuthorDialog } from './author-dialog';
import type { AuthorDto, MemberOption } from './types';

export type AuthorListProps = {
  authors: AuthorDto[];
  members: MemberOption[];
  canUpload: boolean;
};

type DialogState =
  { kind: 'create' } | { kind: 'edit'; author: AuthorDto } | { kind: 'delete'; author: AuthorDto } | null;

export function AuthorList({ authors, members, canUpload }: AuthorListProps) {
  const t = useT();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function move(author: AuthorDto, direction: -1 | 1) {
    const index = authors.findIndex((a) => a.id === author.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= authors.length) return;
    const ids = authors.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setBusyId(author.id);
    const result = await reorderAuthorsAction({ ids });
    setBusyId(null);
    if (!result.ok) toast.error(result.error);
  }

  async function setActive(author: AuthorDto, isActive: boolean) {
    setBusyId(author.id);
    const result = await setAuthorActiveAction({ id: author.id, isActive });
    setBusyId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      isActive
        ? t('taxonomy.authors.toast.activated', { name: author.name })
        : t('taxonomy.authors.toast.deactivated', { name: author.name }),
    );
  }

  async function remove(author: AuthorDto) {
    const result = await deleteAuthorAction(author.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('taxonomy.authors.toast.deleted', { name: author.name }));
  }

  const columns: ColumnDef<AuthorDto>[] = [
    {
      key: 'order',
      header: <span className="sr-only">{t('taxonomy.authors.order')}</span>,
      width: 84,
      className: 'pr-0',
      cell: (row, index) => (
        <span className="inline-flex items-center gap-0.5">
          <IconButton
            label={t('taxonomy.moveUp', { name: row.name })}
            size="sm"
            variant="ghost"
            disabled={index === 0 || busyId === row.id}
            onClick={() => void move(row, -1)}
          >
            <ArrowUp />
          </IconButton>
          <IconButton
            label={t('taxonomy.moveDown', { name: row.name })}
            size="sm"
            variant="ghost"
            disabled={index === authors.length - 1 || busyId === row.id}
            onClick={() => void move(row, 1)}
          >
            <ArrowDown />
          </IconButton>
        </span>
      ),
    },
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={row.name} src={row.imageUrl} size="md" />
          <div className="min-w-0">
            <button
              type="button"
              className={cn(
                'focus-visible:outline-ring block truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                !row.isActive && 'text-muted',
              )}
              onClick={() => setDialog({ kind: 'edit', author: row })}
            >
              {row.name}
            </button>
            <p className="text-subtle truncate text-xs">
              {row.title ?? ''}
              {row.title ? ' · ' : ''}
              <a
                href={publicPaths.author(row.slug)}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:underline"
              >
                {publicPaths.author(row.slug)}
              </a>
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('taxonomy.authors.contact'),
      hideBelow: 'md',
      cell: (row) => (
        <div className="text-muted grid text-xs">
          {row.email ? (
            <a href={`mailto:${row.email}`} className="truncate hover:underline">
              {row.email}
            </a>
          ) : null}
          {row.phone ? <span>{row.phone}</span> : null}
          {!row.email && !row.phone ? <span className="text-subtle">–</span> : null}
        </div>
      ),
    },
    {
      key: 'user',
      header: t('taxonomy.authors.user'),
      hideBelow: 'lg',
      cell: (row) =>
        row.userId ? (
          <span className="text-muted inline-flex items-center gap-1 text-xs">
            <UserRound className="size-3.5" aria-hidden />
            {row.userName ?? row.userEmail}
          </span>
        ) : (
          <Badge variant="outline">{t('taxonomy.authors.external')}</Badge>
        ),
    },
    {
      key: 'count',
      header: t('taxonomy.articles'),
      align: 'right',
      width: 90,
      cell: (row) => (
        <a
          href={`${adminPaths.articles()}?authorId=${row.id}`}
          className="focus-visible:outline-ring rounded-sm tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          title={t('taxonomy.authors.showArticles')}
        >
          {formatNumber(row.articleCount)}
        </a>
      ),
    },
    {
      key: 'active',
      header: t('taxonomy.field.isActive'),
      width: 90,
      cell: (row) => (
        <Switch
          aria-label={t('taxonomy.authors.activeFor', { name: row.name })}
          size="sm"
          checked={row.isActive}
          disabled={busyId === row.id}
          onCheckedChange={(v) => void setActive(row, v)}
        />
      ),
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
            <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog({ kind: 'edit', author: row })}>
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<Trash2 />}
              destructive
              onSelect={() => setDialog({ kind: 'delete', author: row })}
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
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-sm tabular-nums">
          {t('taxonomy.authors.count', { count: authors.length })}
        </span>
        <Button onClick={() => setDialog({ kind: 'create' })} leftIcon={<Plus />}>
          {t('taxonomy.authors.new')}
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={authors}
        rowKey="id"
        caption={t('taxonomy.authors.caption')}
        emptyState={
          <EmptyState
            icon={<PenLine />}
            title={t('taxonomy.authors.empty.title')}
            description={t('taxonomy.authors.empty.description')}
            compact
            action={
              <Button size="sm" onClick={() => setDialog({ kind: 'create' })} leftIcon={<Plus />}>
                {t('taxonomy.authors.new')}
              </Button>
            }
          />
        }
      />

      {dialog?.kind === 'create' ? (
        <AuthorDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          members={members}
          canUpload={canUpload}
        />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <AuthorDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          author={dialog.author}
          members={members}
          canUpload={canUpload}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={
          dialog?.kind === 'delete' ? t('taxonomy.authors.delete.title', { name: dialog.author.name }) : ''
        }
        description={
          dialog?.kind === 'delete'
            ? dialog.author.articleCount > 0
              ? t('taxonomy.authors.delete.hasArticles', { count: dialog.author.articleCount })
              : t('taxonomy.authors.delete.empty')
            : ''
        }
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (dialog?.kind === 'delete') await remove(dialog.author);
        }}
      />
    </div>
  );
}
