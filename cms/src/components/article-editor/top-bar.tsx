'use client';
/**
 * EditorTopBar — back link, title, saving indicator, preview button and the
 * overflow menu (copy, delete, release lock). Sticks under the admin topbar.
 */
import { ArrowLeft, Copy, ExternalLink, Eye, LockOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { Button, IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd, useModKeyLabel } from '@/components/ui/kbd';
import { SavingIndicator, type SavingState } from '@/components/ui/saving-indicator';
import { StatusBadge } from '@/components/ui/status-badge';
import { adminPaths } from '@/config/routes';
import type { ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';

export type EditorTopBarProps = {
  articleId: string;
  title: string;
  status: ArticleStatus;
  savingState: SavingState;
  savedAt: Date | null;
  saveError: string | null;
  dirty: boolean;
  publicPath: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  holdsLock: boolean;
  trashed: boolean;
  onBack: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReleaseLock: () => void;
};

export function EditorTopBar({
  articleId,
  title,
  status,
  savingState,
  savedAt,
  saveError,
  dirty,
  publicPath,
  canEdit,
  canDelete,
  canCreate,
  holdsLock,
  trashed,
  onBack,
  onDuplicate,
  onDelete,
  onReleaseLock,
}: EditorTopBarProps) {
  const t = useT();
  const mod = useModKeyLabel();
  return (
    <div className="bg-bg/90 border-border sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center gap-2 border-b px-1 py-2 backdrop-blur">
      <Link
        href={adminPaths.articles()}
        onClick={onBack}
        className="text-muted hover:text-text focus-visible:outline-ring inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('articles.topbar.back')}
      </Link>
      <h1 className="text-text min-w-0 flex-1 truncate text-base font-semibold" title={title}>
        {title || t('articles.untitled')}
      </h1>
      <StatusBadge status={status} />
      <SavingIndicator state={savingState} savedAt={savedAt} error={saveError ?? undefined} />
      {dirty && savingState !== 'saving' ? (
        <span className="text-muted hidden items-center gap-1 text-xs sm:inline-flex">
          {t('articles.topbar.unsaved')} <Kbd>{mod}</Kbd>
          <Kbd>S</Kbd>
        </span>
      ) : null}
      <Button asChild variant="outline" size="sm" leftIcon={<Eye />}>
        <a href={adminPaths.preview(articleId)} target="_blank" rel="noreferrer">
          {t('articles.topbar.preview')}
        </a>
      </Button>
      {status === 'published' && publicPath ? (
        <IconButton label={t('articles.topbar.openPublic')} variant="ghost" size="sm" onClick={() => window.open(publicPath, '_blank', 'noopener')}>
          <ExternalLink />
        </IconButton>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton label={t('common.more')} variant="outline" size="sm" noTooltip>
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCreate ? (
            <DropdownMenuItem icon={<Copy />} onSelect={onDuplicate}>
              {t('articles.menu.duplicate')}
            </DropdownMenuItem>
          ) : null}
          {canEdit && holdsLock ? (
            <DropdownMenuItem icon={<LockOpen />} onSelect={onReleaseLock}>
              {t('articles.menu.releaseLock')}
            </DropdownMenuItem>
          ) : null}
          {canDelete && !trashed ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive icon={<Trash2 />} onSelect={onDelete}>
                {t('articles.menu.trash')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
