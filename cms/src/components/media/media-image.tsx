/**
 * MediaImage — the one way to render an uploaded image. Server-safe (no
 * hooks, no 'use client'), so public pages ship zero JS for pictures.
 *
 *   <MediaImage media={media} sizes="(min-width: 1024px) 50vw, 100vw" aspect="16/9" priority />
 *
 * Renders a plain <img> with `srcset` from the WebP variants, `sizes`, lazy
 * loading unless `priority`, `fetchpriority="high"` for the LCP image,
 * `object-position` from the focal point and the dominant colour as a
 * placeholder background. With `aspect` set, a wrapper box reserves the
 * space so nothing shifts while the image loads. Pass `decorative` for
 * purely presentational images (alt="").
 */
import type { CSSProperties } from 'react';

import type { Media } from '@/db/schema';
import {
  focalObjectPosition,
  mediaAspect,
  mediaDimensions,
  mediaSrcSet,
  mediaUrl,
  type MediaAspect,
} from '@/server/media/urls';
import { cn } from '@/lib/utils';

export type MediaImageSource = Pick<
  Media,
  | 'storageKey'
  | 'variants'
  | 'kind'
  | 'mime'
  | 'width'
  | 'height'
  | 'alt'
  | 'focalX'
  | 'focalY'
  | 'dominantColor'
>;

export type MediaImageProps = {
  media: MediaImageSource;
  /** The `sizes` attribute; defaults to full viewport width. */
  sizes?: string;
  /** Above-the-fold image: eager loading and high fetch priority. */
  priority?: boolean;
  /** Fixed box ratio (wrapper) or 'auto' for the image's own ratio. Omit for an unconstrained <img>. */
  aspect?: MediaAspect;
  /** Override the stored alt text (e.g. an article-specific caption). */
  alt?: string | null;
  /** Purely decorative: alt="" so screen readers skip it. */
  decorative?: boolean;
  /** How the image fills an aspect box. */
  fit?: 'cover' | 'contain';
  /** Target CSS width in px, used to pick the fallback `src` variant. */
  targetWidth?: number;
  /** Classes for the outer element (wrapper when `aspect` is set, otherwise the <img>). */
  className?: string;
  /** Classes for the <img> inside an aspect wrapper. */
  imgClassName?: string;
  draggable?: boolean;
};

export function MediaImage({
  media,
  sizes = '100vw',
  priority = false,
  aspect,
  alt,
  decorative = false,
  fit = 'cover',
  targetWidth = 1280,
  className,
  imgClassName,
  draggable,
}: MediaImageProps) {
  if (media.kind !== 'image') return null;

  const src = mediaUrl(media, targetWidth);
  const srcSet = mediaSrcSet(media);
  const dims = mediaDimensions(media);
  const altText = decorative ? '' : (alt ?? media.alt ?? '');
  const position = focalObjectPosition(media);
  const background = media.dominantColor ?? undefined;

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- SPEC: plain <img> with srcset, no next/image
    <img
      src={src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt={altText}
      width={dims?.width}
      height={dims?.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : undefined}
      draggable={draggable}
      style={{
        objectPosition: position,
        backgroundColor: aspect ? undefined : background,
      }}
      className={cn(
        aspect
          ? cn('absolute inset-0 h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover')
          : 'h-auto max-w-full',
        aspect ? imgClassName : className,
      )}
    />
  );

  if (!aspect) return img;

  const ratio = mediaAspect(media, aspect);
  const style: CSSProperties = { backgroundColor: background };
  if (ratio) style.aspectRatio = ratio;
  return (
    <div className={cn('relative overflow-hidden', !ratio && 'min-h-24', className)} style={style}>
      {img}
    </div>
  );
}
