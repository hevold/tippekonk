/**
 * URL and layout helpers for media rows. Pure module: no Node, Next or
 * database imports, so both server components (public pages) and client
 * components (media picker, editor node views) can use it.
 *
 *   mediaUrl(media, 640)        → best variant ≤ 640 px, else the original
 *   mediaSrcSet(media)          → "…-320.webp 320w, …-640.webp 640w, …"
 *   focalObjectPosition(media)  → "50% 30%"  (for object-position)
 *   mediaAspect(media, '16/9')  → "16 / 9"   (for aspect-ratio)
 *
 * Why this reads process.env directly instead of `@/env`: the validated env
 * module runs a Zod parse with side effects and must stay server-only, while
 * this file is bundled for the browser too. In the browser the variables are
 * undefined, so URLs fall back to `/media/<key>` — which the media route
 * serves for every driver (it proxies S3 objects when needed).
 */
import type { Media, MediaVariant } from '@/db/schema';

export type MediaUrlSource = Pick<Media, 'storageKey' | 'variants' | 'kind'> & Partial<Pick<Media, 'mime'>>;

export type S3UrlOptions = {
  bucket: string;
  region?: string;
  endpoint?: string;
  publicUrl?: string;
};

/** Public object URL for an S3-compatible bucket: CDN base, path-style endpoint, or virtual-host AWS URL. */
export function s3ObjectUrl(opts: S3UrlOptions, key: string): string {
  const base = opts.publicUrl?.replace(/\/+$/, '');
  if (base) return `${base}/${key}`;
  if (opts.endpoint) return `${opts.endpoint.replace(/\/+$/, '')}/${opts.bucket}/${key}`;
  const region = opts.region && opts.region !== 'auto' ? `.${opts.region}` : '';
  return `https://${opts.bucket}.s3${region}.amazonaws.com/${key}`;
}

/** Root-relative or absolute URL for a storage key, depending on the configured driver. */
export function storageKeyUrl(key: string): string {
  if (process.env.STORAGE_DRIVER === 's3' && process.env.S3_BUCKET) {
    return s3ObjectUrl(
      {
        bucket: process.env.S3_BUCKET,
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT,
        publicUrl: process.env.S3_PUBLIC_URL,
      },
      key,
    );
  }
  return `/media/${key}`;
}

/** Variants sorted by ascending width. Tolerates null/garbage JSON from the database. */
export function sortedVariants(variants: Media['variants'] | null | undefined): MediaVariant[] {
  if (!variants || typeof variants !== 'object') return [];
  return Object.values(variants)
    .filter(
      (v): v is MediaVariant =>
        Boolean(v) && typeof v === 'object' && typeof v.key === 'string' && typeof v.width === 'number',
    )
    .sort((a, b) => a.width - b.width);
}

/** Animated GIFs must be served as the original; their single variant is a still poster. */
export function isAnimatedFormat(media: Pick<MediaUrlSource, 'mime' | 'storageKey'>): boolean {
  return media.mime === 'image/gif' || media.storageKey.toLowerCase().endsWith('.gif');
}

/**
 * Best variant whose width is ≤ `width` (the largest such), or the smallest
 * variant wider than the target when nothing fits, or null when there are
 * no variants at all.
 */
export function bestVariant(media: Pick<MediaUrlSource, 'variants'>, width?: number): MediaVariant | null {
  const list = sortedVariants(media.variants);
  if (list.length === 0) return null;
  if (!width || !Number.isFinite(width)) return list[list.length - 1] ?? null;
  let best: MediaVariant | null = null;
  for (const v of list) {
    if (v.width <= width) best = v;
    else break;
  }
  return best ?? list[0] ?? null;
}

/** URL for the best rendition of `media` for a target CSS width (original when no variant fits). */
export function mediaUrl(media: MediaUrlSource, width?: number): string {
  if (media.kind !== 'image' || isAnimatedFormat(media)) return storageKeyUrl(media.storageKey);
  const variant = bestVariant(media, width);
  if (!variant) return storageKeyUrl(media.storageKey);
  // Never hand out a variant larger than requested when the original itself is smaller than the target.
  return storageKeyUrl(variant.key);
}

/** URL of the original file. */
export function mediaOriginalUrl(media: Pick<Media, 'storageKey'>): string {
  return storageKeyUrl(media.storageKey);
}

/** Still image for thumbnails: the poster variant of a GIF, otherwise the same as mediaUrl(). */
export function mediaPosterUrl(media: MediaUrlSource, width?: number): string {
  if (media.kind !== 'image') return storageKeyUrl(media.storageKey);
  const variant = bestVariant(media, width);
  return storageKeyUrl(variant ? variant.key : media.storageKey);
}

/** `srcset` attribute value from the variants; empty string when there are none. */
export function mediaSrcSet(
  media: Pick<Media, 'variants' | 'storageKey'> & Partial<Pick<Media, 'mime'>>,
): string {
  if (isAnimatedFormat({ mime: media.mime, storageKey: media.storageKey })) return '';
  return sortedVariants(media.variants)
    .map((v) => `${storageKeyUrl(v.key)} ${v.width}w`)
    .join(', ');
}

function clamp01(n: number | null | undefined, fallback = 0.5): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/** CSS object-position from the focal point: "50% 30%". */
export function focalObjectPosition(media: Pick<Media, 'focalX' | 'focalY'>): string {
  const x = Math.round(clamp01(media.focalX) * 100);
  const y = Math.round(clamp01(media.focalY) * 100);
  return `${x}% ${y}%`;
}

export type MediaAspect = '16/9' | '4/3' | '3/2' | '1/1' | 'auto';

/** CSS aspect-ratio value: a fixed preset, or the media's own ratio for 'auto' (null when unknown). */
export function mediaAspect(
  media: Pick<Media, 'width' | 'height'>,
  aspect: MediaAspect = 'auto',
): string | null {
  switch (aspect) {
    case '16/9':
      return '16 / 9';
    case '4/3':
      return '4 / 3';
    case '3/2':
      return '3 / 2';
    case '1/1':
      return '1 / 1';
    default:
      return media.width && media.height ? `${media.width} / ${media.height}` : null;
  }
}

/** Intrinsic dimensions for the <img> width/height attributes (avoids layout shift). */
export function mediaDimensions(
  media: Pick<Media, 'width' | 'height'>,
): { width: number; height: number } | null {
  return media.width && media.height ? { width: media.width, height: media.height } : null;
}
