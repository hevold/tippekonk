'use client';
/**
 * PublishCard ("Publisering") — publish date, scheduled time, access
 * (open/plus), breaking, sponsored and noIndex. The scheduled time is set
 * through the schedule action (it changes status), the rest are form
 * fields saved with the article.
 */
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { FormField } from '@/components/ui/form-field';
import { formatDateTime } from '@/components/ui/format';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { ArticleAccess, ArticleStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';

import type { EditorFormValues } from './types';

export type PublishCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  status: ArticleStatus;
  publishedAt: Date | null;
  firstPublishedAt: Date | null;
  scheduledAt: Date | null;
  canPublish: boolean;
  paywallEnabled: boolean;
  /** Open the publish dialog in schedule mode (optionally with a preset time). */
  onSchedule: (at: Date | null) => void;
  /** Cancel a schedule (back to draft). */
  onCancelSchedule: () => void;
  busy: boolean;
};

export function PublishCard({
  values,
  update,
  disabled,
  status,
  publishedAt,
  firstPublishedAt,
  scheduledAt,
  canPublish,
  paywallEnabled,
  onSchedule,
  onCancelSchedule,
  busy,
}: PublishCardProps) {
  const t = useT();
  const [draftTime, setDraftTime] = useState<Date | null>(scheduledAt);
  const canSchedule = canPublish && status !== 'published' && status !== 'archived';

  return (
    <div className="grid gap-4">
      <dl className="text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt>{t('articles.publish.publishedAt')}</dt>
        <dd className="text-text">{publishedAt ? formatDateTime(publishedAt) : t('articles.publish.notPublished')}</dd>
        {firstPublishedAt && publishedAt && firstPublishedAt.getTime() !== publishedAt.getTime() ? (
          <>
            <dt>{t('articles.publish.firstPublishedAt')}</dt>
            <dd className="text-text">{formatDateTime(firstPublishedAt)}</dd>
          </>
        ) : null}
      </dl>

      {canSchedule ? (
        <FormField label={t('articles.publish.scheduledAt')} htmlFor="publish-scheduled-at" help={status === 'scheduled' && scheduledAt ? t('articles.publish.scheduledHelp', { time: formatDateTime(scheduledAt) }) : undefined}>
          <div className="grid gap-2">
            <DateTimeInput
              id="publish-scheduled-at"
              value={draftTime}
              onChange={setDraftTime}
              min={new Date()}
              disabled={busy}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" leftIcon={<CalendarClock />} disabled={busy || !draftTime} onClick={() => onSchedule(draftTime)}>
                {status === 'scheduled' ? t('articles.publish.reschedule') : t('articles.publish.schedule')}
              </Button>
              {status === 'scheduled' ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={onCancelSchedule}>
                  {t('articles.publish.cancelSchedule')}
                </Button>
              ) : null}
            </div>
          </div>
        </FormField>
      ) : null}

      <FormField label={t('articles.publish.access')} htmlFor="publish-access" help={paywallEnabled ? undefined : t('articles.publish.paywallOff')}>
        <NativeSelect
          id="publish-access"
          value={values.access}
          disabled={disabled}
          options={[
            { value: 'open', label: t('common.access.open') },
            { value: 'plus', label: t('common.access.plus') },
          ]}
          onChange={(e) => update({ access: e.target.value as ArticleAccess })}
        />
      </FormField>

      <div className="grid gap-3">
        <Switch
          checked={values.isBreaking}
          disabled={disabled}
          onCheckedChange={(checked) => update({ isBreaking: checked })}
          label={t('articles.publish.breaking')}
          description={t('articles.publish.breakingHelp')}
        />
        <Switch
          checked={values.isSponsored}
          disabled={disabled}
          onCheckedChange={(checked) => update({ isSponsored: checked })}
          label={t('articles.publish.sponsored')}
          description={t('articles.publish.sponsoredHelp')}
        />
        <Switch
          checked={values.noIndex}
          disabled={disabled}
          onCheckedChange={(checked) => update({ noIndex: checked })}
          label={t('articles.publish.noIndex')}
          description={t('articles.publish.noIndexHelp')}
        />
      </div>
    </div>
  );
}
