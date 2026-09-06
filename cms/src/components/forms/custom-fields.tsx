'use client';
/**
 * CustomFieldsForm — generic renderer for a content type's custom fields
 * (FieldDef[] from src/lib/validation/site.ts). Values are keyed by field
 * key; the form only reports changes, the host owns the state.
 *
 *   <CustomFieldsForm fields={contentType.fields} values={values} onChange={setValues} errors={errors} />
 *
 * Field types: text, textarea, richtext (compact ArticleEditor), number,
 * boolean, date, datetime, select, multiselect, media (MediaPicker) and
 * article (search picker). `resolvedMedia` / `resolvedArticles` supply
 * display data for ids that were stored before this session.
 */
import { FileText, ImageIcon, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ArticlePickerDialog } from '@/components/article-editor/article-picker-dialog';
import { ArticleEditor } from '@/components/editor/article-editor';
import { MediaImage } from '@/components/media/media-image';
import { MediaPicker } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { Media } from '@/db/schema';
import { EMPTY_DOC, type ContentDoc } from '@/lib/content/types';
import { useT } from '@/lib/i18n/client';
import type { FieldDef } from '@/lib/validation/site';
import type { PickerArticle } from '@/server/articles/queries';

export type ResolvedMedia = Pick<
  Media,
  'id' | 'storageKey' | 'variants' | 'kind' | 'mime' | 'width' | 'height' | 'alt' | 'focalX' | 'focalY' | 'dominantColor' | 'filename'
>;
export type ResolvedArticle = { id: string; title: string };

export type CustomFieldsFormProps = {
  fields: FieldDef[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  /** Prefix for control ids (several forms on one page). */
  idPrefix?: string;
  resolvedMedia?: Record<string, ResolvedMedia>;
  resolvedArticles?: Record<string, ResolvedArticle>;
  /** Called when a media/article gets picked so the host can cache it. */
  onMediaResolved?: (media: Media) => void;
  onArticleResolved?: (article: ResolvedArticle) => void;
  /** Article being edited (excluded from article pickers). */
  currentArticleId?: string;
};

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v) return [v];
  return [];
}

function asDoc(v: unknown): ContentDoc {
  if (v && typeof v === 'object' && (v as { type?: unknown }).type === 'doc') return v as ContentDoc;
  return EMPTY_DOC;
}

function parseIso(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function CustomFieldsForm({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = 'cf',
  resolvedMedia = {},
  resolvedArticles = {},
  onMediaResolved,
  onArticleResolved,
  currentArticleId,
}: CustomFieldsFormProps) {
  const t = useT();
  const [mediaCache, setMediaCache] = useState<Record<string, ResolvedMedia>>({});
  const [articleCache, setArticleCache] = useState<Record<string, ResolvedArticle>>({});
  const [pickingMediaFor, setPickingMediaFor] = useState<string | null>(null);
  const [pickingArticleFor, setPickingArticleFor] = useState<string | null>(null);

  if (fields.length === 0) return null;

  function set(key: string, value: unknown) {
    const next = { ...values };
    if (value === undefined || value === null || value === '') delete next[key];
    else next[key] = value;
    onChange(next);
  }

  function control(field: FieldDef): ReactNode {
    const id = `${idPrefix}-${field.key}`;
    const value = values[field.key];
    const invalid = Boolean(errors[field.key]);
    switch (field.type) {
      case 'text':
      case 'url':
      case 'email':
        return (
          <Input
            id={id}
            type={field.type === 'url' ? 'url' : field.type === 'email' ? 'email' : 'text'}
            value={asString(value)}
            placeholder={field.placeholder}
            maxLength={field.max ?? (field.type === 'text' ? 500 : 2000)}
            disabled={disabled}
            invalid={invalid}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      case 'textarea':
        return (
          <Textarea
            id={id}
            value={asString(value)}
            placeholder={field.placeholder}
            maxLength={field.max ?? 5000}
            disabled={disabled}
            invalid={invalid}
            autoResize
            rows={3}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      case 'richtext':
        return (
          <ArticleEditor
            value={asDoc(value)}
            onChange={(doc) => set(field.key, doc)}
            compact
            readOnly={disabled}
            placeholder={field.placeholder}
            label={field.label}
            hideFooter
          />
        );
      case 'number':
        return (
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={asString(value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            disabled={disabled}
            invalid={invalid}
            onChange={(e) => set(field.key, e.target.value === '' ? undefined : Number(e.target.value))}
          />
        );
      case 'boolean':
        return (
          <Switch
            id={id}
            checked={value === true || value === 'true'}
            disabled={disabled}
            onCheckedChange={(checked) => set(field.key, checked)}
            label={field.placeholder ?? t('articles.customFields.booleanOn')}
          />
        );
      case 'date':
        return (
          <Input
            id={id}
            type="date"
            value={asString(value)}
            disabled={disabled}
            invalid={invalid}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      case 'datetime':
        return (
          <DateTimeInput
            id={id}
            value={parseIso(value)}
            disabled={disabled}
            invalid={invalid}
            onChange={(d) => set(field.key, d ? d.toISOString() : undefined)}
          />
        );
      case 'select':
        return (
          <NativeSelect
            id={id}
            value={asString(value)}
            options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
            placeholder={field.placeholder ?? t('articles.customFields.selectPlaceholder')}
            disabled={disabled}
            invalid={invalid}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
      case 'multiselect':
        return (
          <Combobox
            id={id}
            multiple
            value={asStringArray(value)}
            options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
            placeholder={field.placeholder ?? t('articles.customFields.selectPlaceholder')}
            disabled={disabled}
            invalid={invalid}
            onChange={(list) => set(field.key, list.length ? list : undefined)}
          />
        );
      case 'media': {
        const mediaId = asString(value);
        const media = mediaId ? (mediaCache[mediaId] ?? resolvedMedia[mediaId]) : undefined;
        return (
          <div className="grid gap-2">
            {mediaId ? (
              <div className="border-border flex items-center gap-3 rounded-md border p-2">
                {media && media.kind === 'image' ? (
                  <MediaImage media={media} aspect="4/3" sizes="80px" targetWidth={320} className="w-20 shrink-0 overflow-hidden rounded-sm" />
                ) : (
                  <span className="bg-surface-2 text-muted flex size-14 shrink-0 items-center justify-center rounded-sm">
                    <ImageIcon className="size-5" aria-hidden />
                  </span>
                )}
                <span className="text-muted min-w-0 flex-1 truncate text-sm">
                  {media?.filename ?? t('articles.customFields.mediaChosen')}
                </span>
                {!disabled ? (
                  <Button variant="ghost" size="sm" leftIcon={<X />} onClick={() => set(field.key, undefined)}>
                    {t('articles.customFields.remove')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!disabled ? (
              <Button id={id} variant="outline" size="sm" leftIcon={<ImageIcon />} onClick={() => setPickingMediaFor(field.key)}>
                {mediaId ? t('articles.customFields.changeMedia') : t('articles.customFields.chooseMedia')}
              </Button>
            ) : null}
          </div>
        );
      }
      case 'article': {
        const articleId = asString(value);
        const article = articleId ? (articleCache[articleId] ?? resolvedArticles[articleId]) : undefined;
        return (
          <div className="grid gap-2">
            {articleId ? (
              <div className="border-border flex items-center gap-3 rounded-md border p-2 text-sm">
                <FileText className="text-muted size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{article?.title ?? t('articles.customFields.articleChosen')}</span>
                {!disabled ? (
                  <Button variant="ghost" size="sm" leftIcon={<X />} onClick={() => set(field.key, undefined)}>
                    {t('articles.customFields.remove')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {!disabled ? (
              <Button id={id} variant="outline" size="sm" leftIcon={<FileText />} onClick={() => setPickingArticleFor(field.key)}>
                {articleId ? t('articles.customFields.changeArticle') : t('articles.customFields.chooseArticle')}
              </Button>
            ) : null}
          </div>
        );
      }
    }
  }

  return (
    <div className="grid gap-4">
      {fields.map((field) => (
        <FormField
          key={field.key}
          label={field.label}
          htmlFor={`${idPrefix}-${field.key}`}
          required={field.required}
          help={field.help}
          error={errors[field.key]}
        >
          {control(field)}
        </FormField>
      ))}
      <MediaPicker
        open={pickingMediaFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickingMediaFor(null);
        }}
        onSelect={(media) => {
          if (!pickingMediaFor) return;
          setMediaCache((prev) => ({ ...prev, [media.id]: media }));
          onMediaResolved?.(media);
          set(pickingMediaFor, media.id);
          setPickingMediaFor(null);
        }}
      />
      <ArticlePickerDialog
        open={pickingArticleFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickingArticleFor(null);
        }}
        currentId={currentArticleId}
        onSelect={(article: PickerArticle) => {
          if (!pickingArticleFor) return;
          setArticleCache((prev) => ({ ...prev, [article.id]: { id: article.id, title: article.title } }));
          onArticleResolved?.({ id: article.id, title: article.title });
          set(pickingArticleFor, article.id);
          setPickingArticleFor(null);
        }}
      />
    </div>
  );
}
