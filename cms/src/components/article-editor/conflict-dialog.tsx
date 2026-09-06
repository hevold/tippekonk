'use client';
/**
 * ConflictDialog — shown when a save returns 409 (someone else saved a newer
 * version). Offers "Last inn på nytt" (discard local changes and reload) or
 * "Overskriv" (save my changes on top of the newest version).
 */
import { TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n/client';

export type ConflictDialogProps = {
  open: boolean;
  message: string;
  busy?: boolean;
  canOverwrite: boolean;
  onReload: () => void;
  onOverwrite: () => void;
  onDismiss: () => void;
};

export function ConflictDialog({
  open,
  message,
  busy,
  canOverwrite,
  onReload,
  onOverwrite,
  onDismiss,
}: ConflictDialogProps) {
  const t = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title={t('articles.conflict.title')}
      description={message}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onDismiss} disabled={busy}>
            {t('articles.conflict.keepEditing')}
          </Button>
          {canOverwrite ? (
            <Button variant="secondary" onClick={onOverwrite} loading={busy}>
              {t('articles.conflict.overwrite')}
            </Button>
          ) : null}
          <Button variant="primary" onClick={onReload} disabled={busy}>
            {t('articles.conflict.reload')}
          </Button>
        </>
      }
    >
      <div className="text-muted flex items-start gap-2 text-sm">
        <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t('articles.conflict.body')}</p>
      </div>
    </Dialog>
  );
}
