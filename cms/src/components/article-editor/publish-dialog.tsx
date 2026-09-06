'use client';
/**
 * PublishDialog — the last step before "Publiser" / "Planlegg": lists the
 * publish issues from the server (errors block, warnings are allowed),
 * shows the checklist with live ticks, and (in schedule mode) the time.
 */
import { CalendarClock, CircleAlert, CircleCheck, Send, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { formatDateTime } from '@/components/ui/format';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { publishIssuesAction } from '@/server/articles/actions';
import type { EditorChecklistItem } from '@/server/articles/queries';
import type { PublishIssue } from '@/server/articles/validation';

export type PublishDialogMode = 'publish' | 'schedule';

export type PublishDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: PublishDialogMode;
  articleId: string;
  title: string;
  checklist: { enabled: boolean; items: EditorChecklistItem[] };
  flags: Record<string, boolean>;
  onToggleChecklist: (itemId: string, checked: boolean) => Promise<void>;
  scheduledAt: Date | null;
  onScheduledAtChange: (at: Date | null) => void;
  onConfirm: () => Promise<void>;
  /** Bumps to refetch issues (e.g. after a save). */
  refreshKey: number;
};

export function PublishDialog({
  open,
  onOpenChange,
  mode,
  articleId,
  title,
  checklist,
  flags,
  onToggleChecklist,
  scheduledAt,
  onScheduledAtChange,
  onConfirm,
  refreshKey,
}: PublishDialogProps) {
  const t = useT();
  const [issues, setIssues] = useState<PublishIssue[] | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const scheduledIso = mode === 'schedule' && scheduledAt ? scheduledAt.toISOString() : '';
  const queryKey = JSON.stringify([articleId, mode, scheduledIso, refreshKey, flags]);
  const loading = open && loadedKey !== queryKey;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void publishIssuesAction({ id: articleId, scheduledAt: scheduledIso || null }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setIssues(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
      setLoadedKey(queryKey);
    });
    return () => {
      cancelled = true;
    };
  }, [open, articleId, scheduledIso, queryKey]);

  const errors = (issues ?? []).filter((i) => i.level === 'error' && !i.field?.startsWith('checklist.'));
  const warnings = (issues ?? []).filter((i) => i.level === 'warning');
  const checklistErrors = (issues ?? []).filter((i) => i.level === 'error' && i.field?.startsWith('checklist.'));
  const blocked = loading || errors.length > 0 || checklistErrors.length > 0 || (mode === 'schedule' && !scheduledAt);

  async function confirm() {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={confirming ? () => {} : onOpenChange}
      title={mode === 'schedule' ? t('articles.publishDialog.scheduleTitle') : t('articles.publishDialog.title')}
      description={title || t('articles.untitled')}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            leftIcon={mode === 'schedule' ? <CalendarClock /> : <Send />}
            loading={confirming}
            disabled={blocked}
            onClick={confirm}
          >
            {mode === 'schedule'
              ? scheduledAt
                ? t('articles.publishDialog.scheduleConfirm', { time: formatDateTime(scheduledAt) })
                : t('articles.publishDialog.scheduleConfirmNoTime')
              : t('articles.publishDialog.confirm')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        {mode === 'schedule' ? (
          <FormField label={t('articles.publishDialog.scheduledAt')} htmlFor="publish-dialog-time" required>
            <DateTimeInput id="publish-dialog-time" value={scheduledAt} onChange={onScheduledAtChange} min={new Date()} />
          </FormField>
        ) : null}

        {error ? <p className="text-danger text-sm">{error}</p> : null}
        {loading && issues === null ? (
          <div className="flex items-center gap-2 py-4">
            <Spinner size="sm" label={t('articles.publishDialog.checking')} />
            <span className="text-muted text-sm">{t('articles.publishDialog.checking')}</span>
          </div>
        ) : null}

        {issues !== null ? (
          <div className="grid gap-2" aria-live="polite">
            {errors.length === 0 && warnings.length === 0 && checklistErrors.length === 0 ? (
              <p className="text-success flex items-center gap-2 text-sm">
                <CircleCheck className="size-4" aria-hidden />
                {t('articles.publishDialog.allGood')}
              </p>
            ) : null}
            {errors.map((issue, i) => (
              <p key={`e${i}`} className="text-danger flex items-start gap-2 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {issue.message}
              </p>
            ))}
            {warnings.map((issue, i) => (
              <p key={`w${i}`} className="text-warning flex items-start gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        {checklist.enabled && checklist.items.length > 0 ? (
          <fieldset className="border-border grid gap-2.5 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t('articles.publishDialog.checklist')}</legend>
            {checklist.items.map((item) => {
              const checked = Boolean(flags[`checklist:${item.id}`]);
              const missing = item.required && !checked;
              return (
                <Checkbox
                  key={item.id}
                  id={`publish-check-${item.id}`}
                  checked={checked}
                  disabled={toggling === item.id}
                  invalid={missing}
                  onCheckedChange={async (value) => {
                    setToggling(item.id);
                    try {
                      await onToggleChecklist(item.id, value === true);
                    } finally {
                      setToggling(null);
                    }
                  }}
                  label={
                    <span className={cn(missing && 'text-danger')}>
                      {item.label}
                      {item.required ? ' *' : ''}
                      {item.vvpRef ? <span className="text-muted ml-1.5 text-xs font-normal">VVP {item.vvpRef}</span> : null}
                    </span>
                  }
                  description={item.help}
                />
              );
            })}
          </fieldset>
        ) : null}
      </div>
    </Dialog>
  );
}
