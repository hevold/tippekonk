'use client';
/**
 * SeoCard — SEO title/description with counters, canonical URL, and the slug
 * editor: read-only URL preview with "Rediger" that unlocks a slug input
 * (validated as a slug, with reserved/uniqueness feedback from the save).
 */
import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/validation/article';

import { SLUG_LOCKED_FLAG, type EditorFormValues } from './types';

export type SeoCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  /** Section slug for the URL preview (null → /a/<id>). */
  sectionSlug: string | null;
  articleId: string;
  /** Published articles keep their slug unless edited explicitly. */
  published: boolean;
  errors?: Record<string, string>;
  siteTitleSuffix: string;
};

function Counter({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <span className={over ? 'text-danger tabular-nums' : 'text-muted tabular-nums'} aria-live="polite">
      {value}/{max}
    </span>
  );
}

export function SeoCard({
  values,
  update,
  disabled,
  sectionSlug,
  articleId,
  published,
  errors = {},
  siteTitleSuffix,
}: SeoCardProps) {
  const t = useT();
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(values.slug);
  const [slugError, setSlugError] = useState<string | null>(null);

  const previewPath = sectionSlug ? `/${sectionSlug}/${values.slug}` : `/a/${articleId}`;
  const isLocked = Boolean(values.flags[SLUG_LOCKED_FLAG]);

  function startEditing() {
    setSlugDraft(values.slug);
    setSlugError(null);
    setEditingSlug(true);
  }

  function applySlug() {
    const next = slugify(slugDraft);
    if (!next) {
      setSlugError(t('articles.seo.slugInvalid'));
      return;
    }
    update({ slug: next, flags: { ...values.flags, [SLUG_LOCKED_FLAG]: true } });
    setEditingSlug(false);
  }

  function resetToAuto() {
    const rest = { ...values.flags };
    delete rest[SLUG_LOCKED_FLAG];
    update({ flags: rest, slug: slugify(values.title) || values.slug });
    setEditingSlug(false);
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <span className="text-text text-sm font-medium">{t('articles.seo.url')}</span>
        {editingSlug ? (
          <div className="grid gap-2">
            <FormField
              label={t('articles.seo.slug')}
              htmlFor="article-slug"
              error={slugError ?? errors.slug}
              help={t('articles.seo.slugHelp')}
            >
              <Input
                id="article-slug"
                value={slugDraft}
                onChange={(e) => {
                  setSlugDraft(e.target.value);
                  setSlugError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applySlug();
                  } else if (e.key === 'Escape') {
                    setEditingSlug(false);
                  }
                }}
                autoFocus
                spellCheck={false}
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" leftIcon={<Check />} onClick={applySlug}>
                {t('articles.seo.slugApply')}
              </Button>
              <Button size="sm" variant="ghost" leftIcon={<X />} onClick={() => setEditingSlug(false)}>
                {t('common.cancel')}
              </Button>
              {isLocked && !published ? (
                <Button size="sm" variant="link" onClick={resetToAuto}>
                  {t('articles.seo.slugAuto')}
                </Button>
              ) : null}
            </div>
            {slugDraft && slugify(slugDraft) !== slugDraft ? (
              <p className="text-muted text-xs">
                {t('articles.seo.slugPreview', { slug: slugify(slugDraft) })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <code
              className="bg-surface-2 text-text min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-[13px]"
              title={previewPath}
            >
              {previewPath}
            </code>
            {!disabled ? (
              <Button size="sm" variant="outline" leftIcon={<Pencil />} onClick={startEditing}>
                {t('common.edit')}
              </Button>
            ) : null}
          </div>
        )}
        {errors.slug && !editingSlug ? <p className="text-danger text-[13px]">{errors.slug}</p> : null}
        {published ? <p className="text-muted text-xs">{t('articles.seo.slugPublishedHelp')}</p> : null}
        {!sectionSlug ? <p className="text-muted text-xs">{t('articles.seo.noSection')}</p> : null}
      </div>

      <FormField
        label={
          <span className="flex w-full items-center justify-between gap-2">
            {t('articles.seo.title')}
            <Counter value={values.seoTitle.length} max={SEO_TITLE_MAX} />
          </span>
        }
        htmlFor="seo-title"
        help={t('articles.seo.titleHelp', { suffix: siteTitleSuffix || '' })}
        error={errors.seoTitle}
      >
        <Input
          id="seo-title"
          value={values.seoTitle}
          disabled={disabled}
          maxLength={SEO_TITLE_MAX + 20}
          placeholder={values.title}
          onChange={(e) => update({ seoTitle: e.target.value })}
        />
      </FormField>
      <FormField
        label={
          <span className="flex w-full items-center justify-between gap-2">
            {t('articles.seo.description')}
            <Counter value={values.seoDescription.length} max={SEO_DESCRIPTION_MAX} />
          </span>
        }
        htmlFor="seo-description"
        help={t('articles.seo.descriptionHelp')}
        error={errors.seoDescription}
      >
        <Textarea
          id="seo-description"
          rows={3}
          autoResize
          value={values.seoDescription}
          disabled={disabled}
          maxLength={SEO_DESCRIPTION_MAX + 50}
          placeholder={values.lead}
          onChange={(e) => update({ seoDescription: e.target.value })}
        />
      </FormField>
      <FormField
        label={t('articles.seo.canonical')}
        htmlFor="seo-canonical"
        help={t('articles.seo.canonicalHelp')}
        error={errors.canonicalUrl}
      >
        <Input
          id="seo-canonical"
          type="url"
          value={values.canonicalUrl}
          disabled={disabled}
          placeholder="https://…"
          onChange={(e) => update({ canonicalUrl: e.target.value })}
        />
      </FormField>
    </div>
  );
}
