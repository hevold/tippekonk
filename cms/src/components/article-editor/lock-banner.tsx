'use client';
/**
 * LockBanner — shown when someone else holds the edit lock ("Kari Nordmann
 * redigerer denne saken"), with "Overta" for users who may take over, and
 * when the current user has released their own lock ("Ta låsen").
 */
import { Lock, LockOpen } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatRelative } from '@/components/ui/format';
import { useT } from '@/lib/i18n/client';
import type { LockState } from '@/server/articles/locks';

export type LockBannerProps = {
  lock: LockState;
  /** Whether the current user released their lock voluntarily. */
  released: boolean;
  busy?: boolean;
  onTakeOver: () => void;
  onRetry: () => void;
};

export function LockBanner({ lock, released, busy, onTakeOver, onRetry }: LockBannerProps) {
  const t = useT();
  if (released && !lock.lockedBy) {
    return (
      <Alert
        variant="info"
        live
        icon={<LockOpen aria-hidden />}
        title={t('articles.lock.releasedTitle')}
        actions={
          <Button size="sm" variant="primary" loading={busy} onClick={onRetry}>
            {t('articles.lock.retake')}
          </Button>
        }
      >
        {t('articles.lock.releasedBody')}
      </Alert>
    );
  }
  if (!lock.lockedBy || lock.mine) return null;
  const since = lock.lockedAt ? formatRelative(lock.lockedAt) : '';
  return (
    <Alert
      variant={lock.stale ? 'warning' : 'info'}
      live
      icon={<Lock aria-hidden />}
      title={t('articles.lock.lockedTitle', { name: lock.lockedBy.name })}
      actions={
        <>
          <Button size="sm" variant="outline" loading={busy} onClick={onRetry}>
            {t('articles.lock.retry')}
          </Button>
          {lock.canTakeOver ? (
            <Button size="sm" variant="primary" loading={busy} onClick={onTakeOver}>
              {t('articles.lock.takeOver')}
            </Button>
          ) : null}
        </>
      }
    >
      {lock.stale
        ? t('articles.lock.staleBody', { since })
        : t('articles.lock.lockedBody', { since })}
    </Alert>
  );
}
