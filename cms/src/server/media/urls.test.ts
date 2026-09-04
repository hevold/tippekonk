import { afterEach, describe, expect, it } from 'vitest';

import type { Media } from '@/db/schema';

import {
  bestVariant,
  focalObjectPosition,
  mediaAspect,
  mediaPosterUrl,
  mediaSrcSet,
  mediaUrl,
  s3ObjectUrl,
  sortedVariants,
  storageKeyUrl,
} from './urls';

const base = '2026/09/11111111-1111-4111-8111-111111111111';

const image: Pick<
  Media,
  'storageKey' | 'variants' | 'kind' | 'mime' | 'width' | 'height' | 'focalX' | 'focalY'
> = {
  storageKey: `${base}.jpg`,
  kind: 'image',
  mime: 'image/jpeg',
  width: 1600,
  height: 1000,
  focalX: 0.5,
  focalY: 0.3,
  variants: {
    // Deliberately unsorted keys: the helpers must sort by width.
    '960': { key: `${base}-960.webp`, width: 960, height: 600, format: 'webp', size: 3 },
    '320': { key: `${base}-320.webp`, width: 320, height: 200, format: 'webp', size: 1 },
    '1280': { key: `${base}-1280.webp`, width: 1280, height: 800, format: 'webp', size: 4 },
    '640': { key: `${base}-640.webp`, width: 640, height: 400, format: 'webp', size: 2 },
  },
};

describe('variant selection', () => {
  it('sorts variants by width and tolerates garbage', () => {
    expect(sortedVariants(image.variants).map((v) => v.width)).toEqual([320, 640, 960, 1280]);
    expect(sortedVariants(null)).toEqual([]);
    expect(sortedVariants({ bad: { nope: true } } as unknown as Media['variants'])).toEqual([]);
  });

  it('picks the largest variant not wider than the target', () => {
    expect(bestVariant(image, 700)?.width).toBe(640);
    expect(bestVariant(image, 640)?.width).toBe(640);
    expect(bestVariant(image, 5000)?.width).toBe(1280);
    expect(bestVariant(image)?.width).toBe(1280);
    // Nothing fits below 320 → the smallest variant rather than the full original.
    expect(bestVariant(image, 100)?.width).toBe(320);
    expect(bestVariant({ variants: {} }, 640)).toBeNull();
  });
});

describe('mediaUrl / mediaSrcSet', () => {
  it('returns the best variant URL, or the original when there are no variants', () => {
    expect(mediaUrl(image, 700)).toBe(`/media/${base}-640.webp`);
    expect(mediaUrl({ ...image, variants: {} }, 700)).toBe(`/media/${base}.jpg`);
  });

  it('serves non-images and animated GIFs as the original', () => {
    expect(mediaUrl({ ...image, kind: 'video', storageKey: `${base}.mp4` }, 640)).toBe(`/media/${base}.mp4`);
    const gif = { ...image, mime: 'image/gif', storageKey: `${base}.gif` };
    expect(mediaUrl(gif, 640)).toBe(`/media/${base}.gif`);
    expect(mediaSrcSet(gif)).toBe('');
    // …but thumbnails may use the still poster.
    expect(mediaPosterUrl(gif, 640)).toBe(`/media/${base}-640.webp`);
  });

  it('builds a srcset in ascending width order', () => {
    expect(mediaSrcSet(image)).toBe(
      [
        `/media/${base}-320.webp 320w`,
        `/media/${base}-640.webp 640w`,
        `/media/${base}-960.webp 960w`,
        `/media/${base}-1280.webp 1280w`,
      ].join(', '),
    );
    expect(mediaSrcSet({ ...image, variants: {} })).toBe('');
  });
});

describe('S3 URLs', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses the CDN base, endpoint or virtual-host form', () => {
    expect(s3ObjectUrl({ bucket: 'b', publicUrl: 'https://cdn.x.no/' }, 'k.jpg')).toBe(
      'https://cdn.x.no/k.jpg',
    );
    expect(s3ObjectUrl({ bucket: 'b', endpoint: 'https://s3.x.no' }, 'k.jpg')).toBe(
      'https://s3.x.no/b/k.jpg',
    );
    expect(s3ObjectUrl({ bucket: 'b', region: 'eu-west-1' }, 'k.jpg')).toBe(
      'https://b.s3.eu-west-1.amazonaws.com/k.jpg',
    );
  });

  it('switches storageKeyUrl to absolute URLs when the s3 driver is configured', () => {
    expect(storageKeyUrl('k.jpg')).toBe('/media/k.jpg');
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'bilder';
    process.env.S3_PUBLIC_URL = 'https://bilder.avisen.no';
    expect(storageKeyUrl('k.jpg')).toBe('https://bilder.avisen.no/k.jpg');
    expect(mediaUrl(image, 700)).toBe(`https://bilder.avisen.no/${base}-640.webp`);
  });
});

describe('layout helpers', () => {
  it('formats the focal point as object-position', () => {
    expect(focalObjectPosition({ focalX: 0.5, focalY: 0.3 })).toBe('50% 30%');
    expect(focalObjectPosition({ focalX: 1.7, focalY: -2 })).toBe('100% 0%');
    expect(focalObjectPosition({ focalX: Number.NaN, focalY: 0.25 })).toBe('50% 25%');
  });

  it('computes aspect ratios', () => {
    expect(mediaAspect(image, '16/9')).toBe('16 / 9');
    expect(mediaAspect(image, '1/1')).toBe('1 / 1');
    expect(mediaAspect(image, 'auto')).toBe('1600 / 1000');
    expect(mediaAspect({ width: null, height: null }, 'auto')).toBeNull();
  });
});
