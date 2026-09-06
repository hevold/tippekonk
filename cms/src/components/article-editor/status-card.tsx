'use client';
/**
 * StatusCard — status badge, version and last-saved info, and the workflow
 * buttons the current user is allowed to press (SPEC 5.2). The host
 * computes the button list from allowedTransitions and permissions.
 */
import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { formatDateTime, formatRelative } from '@/components/ui/format';
import { StatusBadge } from '@/components/ui/status-badge';
import type { ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';

export type TransitionButton = {
  key: string;
  label: string;
  variant?: ButtonProps['variant'];
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export type StatusCardProps = {
  status: ArticleStatus;
  version: number;
  updatedAt: Date;
  updatedByName: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  wordCount: number;
  readingTimeMin: number;
  dirty: boolean;
  saving: boolean;
  canEdit: boolean;
  onSave: () => void;
  transitions: TransitionButton[];
  busy: boolean;
};

export function StatusCard({
  status,
  version,
  updatedAt,
  updatedByName,
  publishedAt,
  scheduledAt,
  wordCount,
  readingTimeMin,
  dirty,
  saving,
  canEdit,
  onSave,
  transitions,
  busy,
}: StatusCardProps) {
  const t = useT();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={status} />
        <span className="text-muted text-xs tabular-nums">{t('articles.status.version', { version })}</span>
      </div>
      <dl className="text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt>{t('articles.status.lastSaved')}</dt>
        <dd className="text-text">
          <time dateTime={updatedAt.toISOString()} title={formatDateTime(updatedAt)}>
            {formatRelative(updatedAt)}
          </time>
          {updatedByName ? ` · ${updatedByName}` : ''}
        </dd>
        {publishedAt ? (
          <>
            <dt>{t('articles.status.publishedAt')}</dt>
            <dd className="text-text">{formatDateTime(publishedAt)}</dd>
          </>
        ) : null}
        {status === 'scheduled' && scheduledAt ? (
          <>
            <dt>{t('articles.status.scheduledAt')}</dt>
            <dd className="text-text">{formatDateTime(scheduledAt)}</dd>
          </>
        ) : null}
        <dt>{t('articles.status.length')}</dt>
        <dd className="text-text">{t('articles.status.words', { count: wordCount, minutes: readingTimeMin })}</dd>
      </dl>
      {canEdit ? (
        <div className="grid gap-2">
          <Button variant="outline" onClick={onSave} loading={saving} disabled={busy}>
            {dirty ? t('articles.actions.save') : t('articles.actions.saved')}
          </Button>
          {transitions.map((tr) => (
            <Button key={tr.key} variant={tr.variant ?? 'secondary'} leftIcon={tr.icon} onClick={tr.onClick} disabled={busy || tr.disabled}>
              {tr.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-muted text-sm">{t('articles.status.readOnly')}</p>
      )}
    </div>
  );
}
