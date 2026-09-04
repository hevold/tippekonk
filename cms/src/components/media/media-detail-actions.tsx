'use client';
/**
 * MediaDetailActions — the action row on /admin/media/[id]: download the
 * original, regenerate variants, trash/restore, and permanent delete with a
 * confirmation that warns when articles still use the file.
 */
import { Download, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { destroyMedia, regenerateVariantsAction, restoreMedia, trashMedia } from '@/server/media/actions';
import { mediaOriginalUrl } from '@/server/media/urls';

export type MediaDetailActionsProps = {
  media: Media;
  usageCount: number;
  can: { edit: boolean; delete: boolean };
};

export function MediaDetailActions({ media, usageCount, can }: MediaDetailActionsProps) {
  const t = useT();
  const router = useRouter();
  const [confirm, setConfirm] = useState<'trash' | 'destroy' | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const trashed = Boolean(media.deletedAt);

  const downloadHref = `${mediaOriginalUrl(media)}${mediaOriginalUrl(media).includes('?') ? '&' : '?'}download=${encodeURIComponent(media.filename)}`;

  async function regenerate() {
    setRegenerating(true);
    const result = await regenerateVariantsAction(media.id);
    setRegenerating(false);
    if (result.ok) {
      toast.success(t('media.actions.regenerateDone'));
      router.refresh();
    } else toast.error(result.error);
  }

  async function restore() {
    setRestoring(true);
    const result = await restoreMedia([media.id]);
    setRestoring(false);
    if (result.ok) {
      toast.success(t('media.actions.restoreDone'));
      router.refresh();
    } else toast.error(result.error);
  }

  async function trash() {
    const result = await trashMedia([media.id]);
    if (!result.ok) throw new Error(result.error);
    toast.success(t('media.actions.trashDone'));
    router.refresh();
  }

  async function destroy() {
    const result = await destroyMedia([media.id]);
    if (!result.ok) throw new Error(result.error);
    toast.success(t('media.actions.destroyDone'));
    router.push(adminPaths.media());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="md">
        <a href={downloadHref} download={media.filename}>
          <Download />
          {t('media.actions.download')}
        </a>
      </Button>
      {can.edit && media.kind === 'image' && !trashed ? (
        <Button variant="outline" leftIcon={<RefreshCw />} loading={regenerating} onClick={regenerate}>
          {t('media.actions.regenerate')}
        </Button>
      ) : null}
      {can.delete && !trashed ? (
        <Button variant="outline" leftIcon={<Trash2 />} onClick={() => setConfirm('trash')}>
          {t('media.actions.trash')}
        </Button>
      ) : null}
      {can.delete && trashed ? (
        <>
          <Button variant="outline" leftIcon={<RotateCcw />} loading={restoring} onClick={restore}>
            {t('media.actions.restore')}
          </Button>
          <Button variant="danger" leftIcon={<Trash2 />} onClick={() => setConfirm('destroy')}>
            {t('media.actions.destroy')}
          </Button>
        </>
      ) : null}

      <ConfirmDialog
        open={confirm === 'trash'}
        onOpenChange={(o) => setConfirm(o ? 'trash' : null)}
        title={t('media.confirm.trashTitle', { count: 1 })}
        description={
          usageCount > 0
            ? t('media.confirm.trashInUse', { count: usageCount })
            : t('media.confirm.trashDescription')
        }
        confirmLabel={t('media.actions.trash')}
        onConfirm={trash}
      />
      <ConfirmDialog
        open={confirm === 'destroy'}
        onOpenChange={(o) => setConfirm(o ? 'destroy' : null)}
        title={t('media.confirm.destroyTitle', { count: 1 })}
        description={
          usageCount > 0
            ? `${t('media.confirm.trashInUse', { count: usageCount })} ${t('media.confirm.destroyDescription')}`
            : t('media.confirm.destroyDescription')
        }
        confirmLabel={t('media.actions.destroy')}
        destructive
        onConfirm={destroy}
      />
    </div>
  );
}
