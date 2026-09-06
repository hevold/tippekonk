'use client';
/**
 * MainColumn — kicker, title (autosizing textarea with a counter against
 * settings.editor.titleMaxLength), lead (counter) and the TipTap body editor
 * with the media picker and article picker wired in.
 */
import { useCallback, useRef, useState } from 'react';

import { ArticleEditor } from '@/components/editor/article-editor';
import type { PickedArticle } from '@/components/editor/editor-host';
import { MediaPicker } from '@/components/media/media-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Media } from '@/db/schema';
import type { ContentDoc } from '@/lib/content/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { KICKER_MAX, LEAD_MAX, TITLE_MAX } from '@/lib/validation/article';
import type { SiteSettings } from '@/lib/validation/site';

import { ArticlePickerDialog } from './article-picker-dialog';
import type { EditorFormValues } from './types';

export type MainColumnProps = {
  articleId: string;
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  settings: SiteSettings;
  errors?: Record<string, string>;
  onSave: () => void;
  onMediaPicked: (media: Media) => void;
  relatedTitles: Record<string, string>;
  canUpload: boolean;
  canEditMedia: boolean;
};

function Counter({ value, soft, hard, id }: { value: number; soft: number; hard: number; id: string }) {
  const overSoft = value > soft;
  const overHard = value > hard;
  return (
    <span
      id={id}
      className={cn('text-xs tabular-nums', overHard ? 'text-danger' : overSoft ? 'text-warning' : 'text-muted')}
      aria-live="polite"
    >
      {value}/{soft}
    </span>
  );
}

export function MainColumn({
  articleId,
  values,
  update,
  disabled,
  settings,
  errors = {},
  onSave,
  onMediaPicked,
  relatedTitles,
  canUpload,
  canEditMedia,
}: MainColumnProps) {
  const t = useT();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [articleOpen, setArticleOpen] = useState(false);
  const mediaResolver = useRef<((media: Media | null) => void) | null>(null);
  const articleResolver = useRef<((article: PickedArticle | null) => void) | null>(null);

  const onMediaPick = useCallback(
    () =>
      new Promise<Media | null>((resolve) => {
        mediaResolver.current = resolve;
        setMediaOpen(true);
      }),
    [],
  );
  const onArticlePick = useCallback(
    () =>
      new Promise<PickedArticle | null>((resolve) => {
        articleResolver.current = resolve;
        setArticleOpen(true);
      }),
    [],
  );
  const onBodyChange = useCallback((doc: ContentDoc) => update({ body: doc }), [update]);

  const titleLength = Array.from(values.title).length;
  const leadLength = Array.from(values.lead).length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <label htmlFor="article-kicker" className="sr-only">
          {t('articles.fields.kicker')}
        </label>
        <Input
          id="article-kicker"
          value={values.kicker}
          disabled={disabled}
          maxLength={KICKER_MAX}
          placeholder={t('articles.fields.kickerPlaceholder')}
          className="border-transparent bg-transparent px-0 text-sm font-semibold tracking-wide uppercase shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:outline-0"
          onChange={(e) => update({ kicker: e.target.value })}
        />
      </div>
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="article-title" className="sr-only">
            {t('articles.fields.title')}
          </label>
          <Counter id="article-title-counter" value={titleLength} soft={settings.editor.titleMaxLength} hard={TITLE_MAX} />
        </div>
        <Textarea
          id="article-title"
          value={values.title}
          disabled={disabled}
          autoResize
          rows={1}
          maxRows={6}
          maxLength={TITLE_MAX}
          placeholder={t('articles.fields.titlePlaceholder')}
          aria-describedby="article-title-counter"
          invalid={Boolean(errors.title)}
          className="border-transparent bg-transparent px-0 text-3xl leading-tight font-bold tracking-tight shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:outline-0 sm:text-4xl"
          onChange={(e) => update({ title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('article-lead')?.focus();
            }
          }}
        />
        {errors.title ? <p className="text-danger text-sm">{errors.title}</p> : null}
      </div>
      <div className="grid gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="article-lead" className="sr-only">
            {t('articles.fields.lead')}
          </label>
          <Counter id="article-lead-counter" value={leadLength} soft={settings.editor.leadMaxLength} hard={LEAD_MAX} />
        </div>
        <Textarea
          id="article-lead"
          value={values.lead}
          disabled={disabled}
          autoResize
          rows={2}
          maxRows={10}
          maxLength={LEAD_MAX}
          placeholder={t('articles.fields.leadPlaceholder')}
          aria-describedby="article-lead-counter"
          invalid={Boolean(errors.lead)}
          className="border-transparent bg-transparent px-0 text-lg leading-relaxed shadow-none hover:border-transparent focus-visible:border-transparent focus-visible:outline-0"
          onChange={(e) => update({ lead: e.target.value })}
        />
        {errors.lead ? <p className="text-danger text-sm">{errors.lead}</p> : null}
      </div>
      <ArticleEditor
        value={values.body}
        onChange={onBodyChange}
        onMediaPick={onMediaPick}
        onArticlePick={onArticlePick}
        onSave={onSave}
        readOnly={disabled}
        siteSettings={settings}
        articleId={articleId}
        relatedTitles={relatedTitles}
        label={t('articles.fields.body')}
      />
      <MediaPicker
        open={mediaOpen}
        onOpenChange={(open) => {
          setMediaOpen(open);
          if (!open && mediaResolver.current) {
            mediaResolver.current(null);
            mediaResolver.current = null;
          }
        }}
        canUpload={canUpload}
        canEdit={canEditMedia}
        onSelect={(media) => {
          onMediaPicked(media);
          mediaResolver.current?.(media);
          mediaResolver.current = null;
          setMediaOpen(false);
        }}
      />
      <ArticlePickerDialog
        open={articleOpen}
        onOpenChange={(open) => {
          setArticleOpen(open);
          if (!open && articleResolver.current) {
            articleResolver.current(null);
            articleResolver.current = null;
          }
        }}
        currentId={articleId}
        onSelect={(article) => {
          articleResolver.current?.({ id: article.id, title: article.title });
          articleResolver.current = null;
        }}
      />
    </div>
  );
}
