'use client';
/**
 * RevisionsView — the "Versjoner" page body: the revision list (version,
 * kind, who, when, note), pick two to compare (word-level diff with ins/del
 * styling plus field changes) and "Gjenopprett" with confirmation.
 */
import { GitCompareArrows, History, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatRelative } from '@/components/ui/format';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { RevisionKind } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { diffRevisionsAction, restoreRevisionAction } from '@/server/articles/actions';
import type { DiffChange, RevisionSummary, SnapshotDiff } from '@/server/articles/revisions';

import { fieldLabel } from './types';

export type RevisionsViewProps = {
  articleId: string;
  currentVersion: number;
  revisions: RevisionSummary[];
  canRestore: boolean;
};

const KIND_VARIANT: Record<RevisionKind, 'muted' | 'default' | 'success' | 'info'> = {
  autosave: 'muted',
  manual: 'default',
  publish: 'success',
  restore: 'info',
};

function DiffText({ changes, className }: { changes: DiffChange[]; className?: string }) {
  return (
    <p className={cn('text-text text-sm leading-relaxed break-words whitespace-pre-wrap', className)}>
      {changes.map((c, i) =>
        c.added ? (
          <ins key={i} className="bg-success-soft text-success rounded-xs no-underline">
            {c.value}
          </ins>
        ) : c.removed ? (
          <del key={i} className="bg-danger-soft text-danger rounded-xs">
            {c.value}
          </del>
        ) : (
          <span key={i}>{c.value}</span>
        ),
      )}
    </p>
  );
}

export function RevisionsView({ articleId, currentVersion, revisions, canRestore }: RevisionsViewProps) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => revisions.slice(0, 2).map((r) => r.id));
  const [loaded, setLoaded] = useState<{ key: string; from: number; to: number; diff: SnapshotDiff } | null>(
    null,
  );
  const [restoreTarget, setRestoreTarget] = useState<RevisionSummary | null>(null);

  const byId = useMemo(() => new Map(revisions.map((r) => [r.id, r])), [revisions]);
  const pair = selected.length === 2 ? selected : null;
  const pairKey = pair ? `${pair[0]}:${pair[1]}` : null;
  const diff = pairKey && loaded?.key === pairKey ? loaded : null;
  const loading = Boolean(pairKey) && !diff;

  useEffect(() => {
    if (!pairKey) return;
    const [from, to] = pairKey.split(':') as [string, string];
    let cancelled = false;
    void diffRevisionsAction({ id: articleId, from, to }).then((res) => {
      if (cancelled) return;
      if (res.ok)
        setLoaded({
          key: pairKey,
          from: res.data.from.version,
          to: res.data.to.version,
          diff: res.data.diff,
        });
      else toast.error(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [articleId, pairKey]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      if (!checked) return prev.filter((p) => p !== id);
      if (prev.includes(id)) return prev;
      // Keep at most two: the newest pick replaces the oldest selection.
      return [...prev.slice(-1), id];
    });
  }

  async function restore() {
    if (!restoreTarget) return;
    const res = await restoreRevisionAction({ id: articleId, revisionId: restoreTarget.id });
    if (!res.ok) throw new Error(res.error);
    toast.success(t('articles.revisions.restored', { version: restoreTarget.version }));
    router.push(adminPaths.article(articleId));
    router.refresh();
  }

  if (revisions.length === 0) {
    return <EmptyState icon={<History />} title={t('articles.revisions.none')} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section aria-label={t('articles.revisions.listLabel')} className="min-w-0">
        <p className="text-muted mb-2 text-sm">{t('articles.revisions.pickTwo')}</p>
        <div className="border-border overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">{t('articles.revisions.compare')}</span>
                </TableHead>
                <TableHead>{t('articles.revisions.version')}</TableHead>
                <TableHead>{t('articles.revisions.kindLabel')}</TableHead>
                <TableHead>{t('articles.revisions.who')}</TableHead>
                <TableHead>{t('articles.revisions.when')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisions.map((r) => {
                const checked = selected.includes(r.id);
                return (
                  <TableRow key={r.id} className={cn(checked && 'bg-primary-soft/40')}>
                    <TableCell>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggle(r.id, v === true)}
                        aria-label={t('articles.revisions.selectVersion', { version: r.version })}
                      />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      v{r.version}
                      {r.version === currentVersion ? (
                        <span className="text-muted ml-1 text-xs">({t('articles.revisions.current')})</span>
                      ) : null}
                      {r.note ? <span className="text-muted block text-xs font-normal">{r.note}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={KIND_VARIANT[r.kind]}>{t(`articles.revisions.kind.${r.kind}`)}</Badge>
                    </TableCell>
                    <TableCell>{r.createdBy?.name ?? t('common.unknown')}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={r.createdAt.toISOString()} title={formatDateTime(r.createdAt)}>
                        {formatRelative(r.createdAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      {canRestore && r.version !== currentVersion ? (
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<RotateCcw />}
                          onClick={() => setRestoreTarget(r)}
                        >
                          {t('articles.revisions.restore')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-label={t('articles.revisions.diffLabel')} aria-live="polite" className="min-w-0">
        {!pair ? (
          <EmptyState
            compact
            icon={<GitCompareArrows />}
            title={t('articles.revisions.pickTwoTitle')}
            description={t('articles.revisions.pickTwo')}
          />
        ) : loading && !diff ? (
          <div className="flex items-center gap-2 p-6">
            <Spinner size="sm" />
            <span className="text-muted text-sm">{t('common.loading')}</span>
          </div>
        ) : diff ? (
          <div className="grid gap-4">
            <h2 className="text-base font-semibold">
              {t('articles.revisions.comparing', { from: diff.from, to: diff.to })}
            </h2>
            <p className="text-muted flex items-center gap-3 text-xs">
              <span>
                <ins className="bg-success-soft text-success rounded-xs px-1 no-underline">
                  {t('articles.revisions.added')}
                </ins>
              </span>
              <span>
                <del className="bg-danger-soft text-danger rounded-xs px-1">
                  {t('articles.revisions.removed')}
                </del>
              </span>
              <span className="ml-auto">
                {byId.get(pair[0])?.wordCount ?? 0} → {byId.get(pair[1])?.wordCount ?? 0}{' '}
                {t('articles.revisions.wordsShort')}
              </span>
            </p>
            {diff.diff.fields.length > 0 ? (
              <div className="border-border grid gap-3 rounded-lg border p-4">
                <h3 className="text-sm font-semibold">{t('articles.revisions.fieldChanges')}</h3>
                <dl className="grid gap-2">
                  {diff.diff.fields.map((f) => (
                    <div key={f.field} className="grid gap-0.5">
                      <dt className="text-muted text-xs font-medium tracking-wide uppercase">
                        {fieldLabel(f.field)}
                      </dt>
                      <dd>
                        <DiffText changes={f.changes} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <div className="border-border rounded-lg border p-4">
              <h3 className="mb-2 text-sm font-semibold">{t('articles.revisions.bodyChanges')}</h3>
              {diff.diff.bodyChanged ? (
                <DiffText changes={diff.diff.text} />
              ) : (
                <p className="text-muted text-sm">{t('articles.revisions.bodyUnchanged')}</p>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title={t('articles.revisions.restoreTitle', { version: restoreTarget?.version ?? 0 })}
        description={t('articles.revisions.restoreBody')}
        confirmLabel={t('articles.revisions.restore')}
        onConfirm={restore}
      />
    </div>
  );
}
