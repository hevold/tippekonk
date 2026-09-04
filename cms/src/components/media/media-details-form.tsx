'use client';
/**
 * MediaDetailsForm — alt, caption, credit, license, source, folder, tags and
 * taken-at for one media row. Saves through the updateMediaMeta action and
 * maps field errors back onto the inputs.
 */
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import type { Media } from '@/db/schema';
import { fromLocalInputValue, toLocalInputValue } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { updateMediaMeta } from '@/server/media/actions';

export type MediaDetailsFormProps = {
  media: Media;
  folders?: string[];
  canEdit: boolean;
  /** Called with the saved row (the page also refreshes). */
  onSaved?: (media: Media) => void;
  className?: string;
};

type Values = {
  alt: string;
  caption: string;
  credit: string;
  license: string;
  sourceUrl: string;
  folder: string;
  tags: string;
  takenAt: string;
};

function toValues(media: Media): Values {
  return {
    alt: media.alt ?? '',
    caption: media.caption ?? '',
    credit: media.credit ?? '',
    license: media.license ?? '',
    sourceUrl: media.sourceUrl ?? '',
    folder: media.folder ?? '',
    tags: media.tags.join(', '),
    takenAt: toLocalInputValue(media.takenAt),
  };
}

export function MediaDetailsForm({
  media,
  folders = [],
  canEdit,
  onSaved,
  className,
}: MediaDetailsFormProps) {
  const t = useT();
  const router = useRouter();
  const listId = useId();
  const [values, setValues] = useState<Values>(() => toValues(media));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState(media);

  // Re-sync when the row changes underneath us (router.refresh after another action).
  if (baseline !== media && baseline.updatedAt.getTime() !== media.updatedAt.getTime()) {
    setBaseline(media);
    setValues(toValues(media));
  } else if (baseline !== media) {
    setBaseline(media);
  }

  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const dirty = JSON.stringify(values) !== JSON.stringify(toValues(media));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || saving) return;
    if (values.takenAt && !fromLocalInputValue(values.takenAt)) {
      setErrors({ takenAt: t('media.form.invalidDate') });
      return;
    }
    setSaving(true);
    setErrors({});
    const result = await updateMediaMeta({
      id: media.id,
      alt: values.alt,
      caption: values.caption,
      credit: values.credit,
      license: values.license,
      sourceUrl: values.sourceUrl,
      folder: values.folder,
      tags: values.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      takenAt: values.takenAt ? fromLocalInputValue(values.takenAt)?.toISOString() : '',
    });
    setSaving(false);
    if (result.ok) {
      toast.success(t('media.form.saved'));
      onSaved?.(result.data);
      router.refresh();
    } else {
      if (result.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])));
      }
      toast.error(result.error);
    }
  }

  const readOnly = !canEdit;

  return (
    <form onSubmit={onSubmit} className={cn('flex flex-col gap-4', className)} aria-busy={saving}>
      <FormField
        label={t('media.field.alt')}
        help={t('media.field.altHelp')}
        error={errors.alt}
        required={media.kind === 'image'}
      >
        <Textarea
          value={values.alt}
          onChange={(e) => set('alt')(e.target.value)}
          readOnly={readOnly}
          maxLength={1000}
          rows={2}
          autoResize
        />
      </FormField>
      <FormField label={t('media.field.caption')} error={errors.caption}>
        <Textarea
          value={values.caption}
          onChange={(e) => set('caption')(e.target.value)}
          readOnly={readOnly}
          maxLength={2000}
          rows={2}
          autoResize
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('media.field.credit')} error={errors.credit} help={t('media.field.creditHelp')}>
          <Input
            value={values.credit}
            onChange={(e) => set('credit')(e.target.value)}
            readOnly={readOnly}
            maxLength={300}
            placeholder={t('media.field.creditPlaceholder')}
          />
        </FormField>
        <FormField label={t('media.field.license')} error={errors.license}>
          <Input
            value={values.license}
            onChange={(e) => set('license')(e.target.value)}
            readOnly={readOnly}
            maxLength={200}
          />
        </FormField>
      </div>
      <FormField label={t('media.field.sourceUrl')} error={errors.sourceUrl}>
        <Input
          type="url"
          value={values.sourceUrl}
          onChange={(e) => set('sourceUrl')(e.target.value)}
          readOnly={readOnly}
          maxLength={2000}
          placeholder="https://"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('media.field.folder')} error={errors.folder}>
          <Input
            value={values.folder}
            onChange={(e) => set('folder')(e.target.value)}
            readOnly={readOnly}
            maxLength={120}
            list={folders.length ? listId : undefined}
          />
        </FormField>
        {folders.length ? (
          <datalist id={listId}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        ) : null}
        <FormField label={t('media.field.takenAt')} error={errors.takenAt}>
          <Input
            type="datetime-local"
            value={values.takenAt}
            onChange={(e) => set('takenAt')(e.target.value)}
            readOnly={readOnly}
          />
        </FormField>
      </div>
      <FormField label={t('media.field.tags')} help={t('media.field.tagsHelp')} error={errors.tags}>
        <Input value={values.tags} onChange={(e) => set('tags')(e.target.value)} readOnly={readOnly} />
      </FormField>
      {canEdit ? (
        <div className="flex items-center gap-2">
          <Button type="submit" loading={saving} disabled={!dirty}>
            {t('common.save')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => setValues(toValues(media))}
          >
            {t('media.form.discard')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
