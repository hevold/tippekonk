'use client';
/**
 * RowActions — the "…" menu on every list row plus the shared helpers the
 * bulk bar uses. Which items show is derived from the row's status and the
 * user's permissions (the article service is the authority and re-checks).
 * Actions are the editor area's server actions (SPEC 4.7).
 */
import {
  Archive,
  Copy,
  ExternalLink,
  Eye,
  MoreHorizontal,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { ActionResult } from '@/server/actions';
import {
  destroyAction,
  duplicateAction,
  publishAction,
  restoreAction,
  transitionAction,
  trashAction,
  unpublishAction,
} from '@/server/articles/actions';
import { canTransition, canTrash } from '@/server/articles/validation';

import { canEditRow, type ArticleRowDto, type ListPermissions } from './types';

export type RowActionKind =
  | 'sendToDesk'
  | 'approve'
  | 'publish'
  | 'unpublish'
  | 'archive'
  | 'trash'
  | 'restore'
  | 'destroy'
  | 'duplicate';

/** Which actions apply to a row for this user. */
export function availableActions(row: ArticleRowDto, perm: ListPermissions): Set<RowActionKind> {
  const out = new Set<RowActionKind>();
  const editable = canEditRow(perm, row);
  if (row.deletedAt) {
    if (perm.delete) {
      out.add('restore');
      out.add('destroy');
    }
    return out;
  }
  const status: ArticleStatus = row.status;
  if (editable && canTransition(status, 'in_review')) out.add('sendToDesk');
  if (perm.review && editable && canTransition(status, 'approved')) out.add('approve');
  if (perm.publish && canTransition(status, 'published')) out.add('publish');
  if (perm.publish && status === 'published') out.add('unpublish');
  if (perm.publish && canTransition(status, 'archived')) out.add('archive');
  if (canTrash(status) && (perm.delete || (editable && status === 'draft' && row.createdBy === perm.userId))) out.add('trash');
  if (perm.create) out.add('duplicate');
  return out;
}

/** Run one action for one article; returns the ActionResult so callers can summarise. */
export async function runRowAction(kind: RowActionKind, id: string): Promise<ActionResult<unknown>> {
  switch (kind) {
    case 'sendToDesk':
      return transitionAction({ id, to: 'in_review' });
    case 'approve':
      return transitionAction({ id, to: 'approved' });
    case 'publish':
      return publishAction(id);
    case 'unpublish':
      return unpublishAction(id);
    case 'archive':
      return transitionAction({ id, to: 'archived' });
    case 'trash':
      return trashAction(id);
    case 'restore':
      return restoreAction(id);
    case 'destroy':
      return destroyAction(id);
    case 'duplicate':
      return duplicateAction(id);
  }
}

export const ACTION_LABEL_KEY: Record<RowActionKind, string> = {
  sendToDesk: 'list.action.sendToDesk',
  approve: 'list.action.approve',
  publish: 'list.action.publish',
  unpublish: 'list.action.unpublish',
  archive: 'list.action.archive',
  trash: 'list.action.trash',
  restore: 'list.action.restore',
  destroy: 'list.action.destroy',
  duplicate: 'list.action.duplicate',
};

export type RowActionsProps = {
  row: ArticleRowDto;
  perm: ListPermissions;
  /** Called after any successful mutation (the page refreshes itself via the action). */
  onDone?: () => void;
};

export function RowActions({ row, perm, onDone }: RowActionsProps) {
  const t = useT();
  const router = useRouter();
  const [confirm, setConfirm] = useState<RowActionKind | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = availableActions(row, perm);
  const title = row.title.trim() || t('list.untitled');

  async function perform(kind: RowActionKind) {
    setBusy(true);
    try {
      const result = await runRowAction(kind, row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (kind === 'duplicate') {
        const copy = result.data as { id: string };
        toast.success(t('list.toast.duplicated'));
        router.push(adminPaths.article(copy.id));
        return;
      }
      toast.success(t(`list.toast.${kind}`, { title }));
      onDone?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const needsConfirm = (kind: RowActionKind) => kind === 'destroy' || kind === 'trash' || kind === 'unpublish' || kind === 'publish';

  const item = (kind: RowActionKind, icon: React.ReactNode, destructive = false) =>
    actions.has(kind) ? (
      <DropdownMenuItem
        key={kind}
        icon={icon}
        destructive={destructive}
        disabled={busy}
        onSelect={() => (needsConfirm(kind) ? setConfirm(kind) : void perform(kind))}
      >
        {t(ACTION_LABEL_KEY[kind])}
      </DropdownMenuItem>
    ) : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={t('list.actionsFor', { title })} size="sm" disabled={busy}>
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          <DropdownMenuItem asChild icon={<ExternalLink />}>
            <Link href={adminPaths.article(row.id)}>{t('list.action.open')}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild icon={<Eye />}>
            <a href={adminPaths.preview(row.id)} target="_blank" rel="noreferrer">
              {t('list.action.preview')}
            </a>
          </DropdownMenuItem>
          {item('duplicate', <Copy />)}
          {actions.has('sendToDesk') || actions.has('approve') || actions.has('publish') || actions.has('unpublish') || actions.has('archive') ? (
            <DropdownMenuSeparator />
          ) : null}
          {item('sendToDesk', <Send />)}
          {item('approve', <Upload />)}
          {item('publish', <Upload />)}
          {item('unpublish', <Undo2 />)}
          {item('archive', <Archive />)}
          {actions.has('trash') || actions.has('restore') || actions.has('destroy') ? <DropdownMenuSeparator /> : null}
          {item('restore', <RotateCcw />)}
          {item('trash', <Trash2 />, true)}
          {item('destroy', <Trash2 />, true)}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? t(`list.confirm.${confirm}.title`) : ''}
        description={confirm ? t(`list.confirm.${confirm}.description`, { title }) : ''}
        confirmLabel={confirm ? t(ACTION_LABEL_KEY[confirm]) : undefined}
        destructive={confirm === 'destroy' || confirm === 'trash'}
        onConfirm={async () => {
          if (confirm) await perform(confirm);
        }}
      />
    </>
  );
}
