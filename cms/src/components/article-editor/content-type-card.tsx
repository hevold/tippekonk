'use client';
/**
 * ContentTypeCard ("Innholdstype") — shows the current content type with a
 * "Bytt" control (changeContentTypeAction keeps common custom fields) and
 * renders the type's custom fields through <CustomFieldsForm>.
 */
import { useState } from 'react';

import { CustomFieldsForm, type ResolvedArticle, type ResolvedMedia } from '@/components/forms/custom-fields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { EditorContentType } from '@/server/articles/queries';

export type ContentTypeCardProps = {
  articleId: string;
  contentType: EditorContentType;
  contentTypes: EditorContentType[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  disabled: boolean;
  onChangeType: (contentTypeId: string) => Promise<void>;
  resolvedMedia: Record<string, ResolvedMedia>;
  resolvedArticles: Record<string, ResolvedArticle>;
  onMediaResolved: (media: Media) => void;
  onArticleResolved: (article: ResolvedArticle) => void;
};

export function ContentTypeCard({
  articleId,
  contentType,
  contentTypes,
  values,
  onChange,
  errors,
  disabled,
  onChangeType,
  resolvedMedia,
  resolvedArticles,
  onMediaResolved,
  onArticleResolved,
}: ContentTypeCardProps) {
  const t = useT();
  const [pending, setPending] = useState<string | null>(null);
  const options = contentTypes
    .filter((c) => c.isActive || c.id === contentType.id)
    .map((c) => ({ value: c.id, label: c.name }));
  const target = pending ? contentTypes.find((c) => c.id === pending) : null;

  return (
    <div className="grid gap-4">
      <FormField
        label={t('articles.contentType.label')}
        htmlFor="article-content-type"
        help={contentType.description ?? undefined}
      >
        <NativeSelect
          id="article-content-type"
          value={contentType.id}
          options={options}
          disabled={disabled || options.length < 2}
          onChange={(e) => {
            if (e.target.value !== contentType.id) setPending(e.target.value);
          }}
        />
      </FormField>
      {contentType.fields.length > 0 ? (
        <CustomFieldsForm
          fields={contentType.fields}
          values={values}
          onChange={onChange}
          errors={errors}
          disabled={disabled}
          idPrefix={`cf-${contentType.key}`}
          resolvedMedia={resolvedMedia}
          resolvedArticles={resolvedArticles}
          onMediaResolved={onMediaResolved}
          onArticleResolved={onArticleResolved}
          currentArticleId={articleId}
        />
      ) : (
        <p className="text-muted text-sm">{t('articles.contentType.noFields')}</p>
      )}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={t('articles.contentType.changeTitle', { name: target?.name ?? '' })}
        description={t('articles.contentType.changeBody')}
        confirmLabel={t('articles.contentType.changeConfirm')}
        onConfirm={async () => {
          if (pending) await onChangeType(pending);
          setPending(null);
        }}
      />
    </div>
  );
}
