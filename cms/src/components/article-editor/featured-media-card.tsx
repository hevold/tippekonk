'use client';
/**
 * FeaturedMediaCard ("Hovedbilde") — preview of the featured image, pick /
 * replace / remove via MediaPicker, and per-article caption/credit
 * overrides. Warns inline when the image lacks alt text (blocks publish).
 */
import { ImageIcon, Replace, X } from 'lucide-react';
import { useState } from 'react';

import { MediaImage } from '@/components/media/media-image';
import { MediaPicker } from '@/components/media/media-picker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adminPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { EditorMediaInfo } from '@/server/articles/queries';

import type { EditorFormValues } from './types';

export type FeaturedMediaCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  media: EditorMediaInfo | Media | null;
  onMediaPicked: (media: Media) => void;
  canUpload: boolean;
  canEditMedia: boolean;
  error?: string;
};

export function FeaturedMediaCard({
  values,
  update,
  disabled,
  media,
  onMediaPicked,
  canUpload,
  canEditMedia,
  error,
}: FeaturedMediaCardProps) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const missingAlt = media && !media.alt?.trim();

  return (
    <div className="grid gap-3">
      {values.featuredMediaId && media ? (
        <figure className="grid gap-2">
          <MediaImage
            media={media}
            aspect="16/9"
            sizes="320px"
            targetWidth={640}
            className="overflow-hidden rounded-md"
          />
          <figcaption className="text-muted flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{media.filename}</span>
            <a
              href={adminPaths.mediaItem(media.id)}
              target="_blank"
              rel="noreferrer"
              className="text-primary shrink-0 hover:underline"
            >
              {t('articles.featured.openInLibrary')}
            </a>
          </figcaption>
        </figure>
      ) : values.featuredMediaId ? (
        <Alert variant="warning">{t('articles.featured.missing')}</Alert>
      ) : (
        <div className="bg-surface-2 text-muted flex aspect-video items-center justify-center rounded-md text-sm">
          <ImageIcon className="mr-2 size-4" aria-hidden />
          {t('articles.featured.none')}
        </div>
      )}
      {missingAlt ? <Alert variant="danger">{t('articles.featured.missingAlt')}</Alert> : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            leftIcon={values.featuredMediaId ? <Replace /> : <ImageIcon />}
            onClick={() => setPicking(true)}
          >
            {values.featuredMediaId ? t('articles.featured.replace') : t('articles.featured.choose')}
          </Button>
          {values.featuredMediaId ? (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X />}
              onClick={() => update({ featuredMediaId: null, featuredCaption: '', featuredCredit: '' })}
            >
              {t('articles.featured.remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {values.featuredMediaId ? (
        <>
          <FormField
            label={t('articles.featured.caption')}
            htmlFor="featured-caption"
            help={
              media?.caption ? t('articles.featured.captionDefault', { value: media.caption }) : undefined
            }
          >
            <Textarea
              id="featured-caption"
              rows={2}
              autoResize
              value={values.featuredCaption}
              disabled={disabled}
              placeholder={media?.caption ?? ''}
              onChange={(e) => update({ featuredCaption: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('articles.featured.credit')}
            htmlFor="featured-credit"
            help={media?.credit ? t('articles.featured.creditDefault', { value: media.credit }) : undefined}
          >
            <Input
              id="featured-credit"
              value={values.featuredCredit}
              disabled={disabled}
              placeholder={media?.credit ?? 'Foto: …'}
              onChange={(e) => update({ featuredCredit: e.target.value })}
            />
          </FormField>
        </>
      ) : null}
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        kind="image"
        canUpload={canUpload}
        canEdit={canEditMedia}
        onSelect={(picked) => {
          onMediaPicked(picked);
          update({ featuredMediaId: picked.id });
          setPicking(false);
        }}
      />
    </div>
  );
}
