import { describe, expect, it, vi } from 'vitest';

import type { Media } from '@/db/schema';

vi.mock('server-only', () => ({}));

import type { ApiArticle } from './queries';
import { absolute, articleUrl, serializeArticle, serializeImage, serializeTeaser } from './serializers';

const media: Media = {
  id: 'm1',
  siteId: 's1',
  kind: 'image',
  filename: 'bilde.jpg',
  storageKey: '2026/09/bilde.jpg',
  mime: 'image/jpeg',
  size: 1000,
  width: 1600,
  height: 900,
  duration: null,
  alt: 'Rådhuset',
  caption: 'Rådhuset i Elvebyen',
  credit: 'Foto: Ola Vik',
  license: null,
  sourceUrl: null,
  focalX: 0.5,
  focalY: 0.5,
  variants: {
    '640': { key: '2026/09/bilde-640.webp', width: 640, height: 360, format: 'webp', size: 100 },
    '1280': { key: '2026/09/bilde-1280.webp', width: 1280, height: 720, format: 'webp', size: 200 },
  },
  dominantColor: null,
  folder: null,
  tags: [],
  exif: null,
  takenAt: null,
  uploadedBy: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  deletedAt: null,
};

const article: ApiArticle = {
  id: 'a1',
  title: 'Budsjettet vedtatt',
  kicker: 'Kommunestyret',
  lead: 'Ingress',
  slug: 'budsjettet-vedtatt',
  status: 'published',
  sectionId: 'sec1',
  sectionSlug: 'nyheter',
  sectionName: 'Nyheter',
  access: 'plus',
  publishedAt: new Date('2026-09-05T10:00:00Z'),
  firstPublishedAt: new Date('2026-09-05T10:00:00Z'),
  scheduledAt: null,
  updatedAt: new Date('2026-09-05T11:00:00Z'),
  isBreaking: true,
  isSponsored: false,
  contentTypeKey: 'article',
  featuredMedia: media,
  bylines: [{ id: 'au1', name: 'Ingrid Haugen', slug: 'ingrid-haugen', role: 'text', title: 'Journalist' }],
  tags: [{ id: 't1', name: 'Budsjett', slug: 'budsjett' }],
  readingTimeMin: 3,
  wordCount: 540,
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hei <verden>' }] }] },
  featuredCaption: null,
  featuredCredit: null,
  seoTitle: null,
  seoDescription: 'SEO',
  canonicalUrl: null,
  customFields: { standpoint: 'leder' },
  bodyMedia: new Map(),
  bodyArticles: new Map(),
};

describe('public api serializers', () => {
  it('builds absolute urls', () => {
    expect(absolute('https://avis.no/', '/nyheter')).toBe('https://avis.no/nyheter');
    expect(absolute('https://avis.no', 'https://x.no/y')).toBe('https://x.no/y');
    expect(articleUrl('https://avis.no', { id: 'a1', slug: 's', sectionSlug: null })).toBe(
      'https://avis.no/a/a1',
    );
    expect(articleUrl('https://avis.no', { id: 'a1', slug: 's', sectionSlug: 'sport' })).toBe(
      'https://avis.no/sport/s',
    );
  });

  it('serialises images with absolute src and srcset', () => {
    const img = serializeImage('https://avis.no', media);
    expect(img).toMatchObject({
      id: 'm1',
      alt: 'Rådhuset',
      credit: 'Foto: Ola Vik',
      width: 1600,
      height: 900,
    });
    expect(img?.url).toBe('https://avis.no/media/2026/09/bilde-1280.webp');
    expect(img?.srcset).toBe(
      'https://avis.no/media/2026/09/bilde-640.webp 640w, https://avis.no/media/2026/09/bilde-1280.webp 1280w',
    );
    expect(serializeImage('https://avis.no', { ...media, deletedAt: new Date() })).toBeNull();
  });

  it('produces the stable teaser and article shapes', () => {
    const teaser = serializeTeaser('https://avis.no', article);
    expect(teaser).toEqual({
      id: 'a1',
      title: 'Budsjettet vedtatt',
      kicker: 'Kommunestyret',
      lead: 'Ingress',
      slug: 'budsjettet-vedtatt',
      url: 'https://avis.no/nyheter/budsjettet-vedtatt',
      section: { id: 'sec1', name: 'Nyheter', slug: 'nyheter' },
      contentType: 'article',
      tags: [{ id: 't1', name: 'Budsjett', slug: 'budsjett', url: 'https://avis.no/tag/budsjett' }],
      bylines: [
        {
          id: 'au1',
          name: 'Ingrid Haugen',
          slug: 'ingrid-haugen',
          role: 'text',
          title: 'Journalist',
          url: 'https://avis.no/skribent/ingrid-haugen',
        },
      ],
      access: 'plus',
      publishedAt: '2026-09-05T10:00:00.000Z',
      updatedAt: '2026-09-05T11:00:00.000Z',
      featuredImage: expect.objectContaining({ id: 'm1' }),
      readingTimeMin: 3,
      isBreaking: true,
      isSponsored: false,
    });
    const full = serializeArticle('https://avis.no', article);
    expect(full.body).toEqual(article.body);
    expect(full.html).toContain('Hei &lt;verden&gt;');
    expect(full.html).not.toContain('<verden>');
    expect(full.seo).toEqual({ title: null, description: 'SEO', canonicalUrl: null });
    expect(full.customFields).toEqual({ standpoint: 'leder' });
    expect(full.wordCount).toBe(540);
    expect(full.related).toEqual([]);
  });
});
