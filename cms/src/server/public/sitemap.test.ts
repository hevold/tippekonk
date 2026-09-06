import { describe, expect, it } from 'vitest';

import type { Section } from '@/db/schema';

import type { SitemapArticle } from './queries';
import {
  SITEMAP_SPLIT_THRESHOLD,
  buildRobots,
  buildSitemap,
  buildSitemapIndex,
  buildUrlSet,
} from './sitemap';

const section = (slug: string): Section => ({
  id: `id-${slug}`,
  siteId: 's',
  parentId: null,
  name: slug,
  slug,
  description: null,
  color: null,
  sortOrder: 0,
  showInMenu: true,
  isActive: true,
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const art = (i: number, sectionSlug: string | null = 'nyheter', noIndex = false): SitemapArticle => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  slug: `sak-${i}`,
  sectionSlug,
  publishedAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date(`2026-09-0${(i % 3) + 1}T12:00:00Z`),
  noIndex,
});

describe('buildSitemap', () => {
  it('renders a single urlset with front, sections and articles (noindex excluded)', () => {
    const plan = buildSitemap({
      baseUrl: 'https://elvebyen.no',
      sections: [section('nyheter'), section('sport')],
      articles: [art(1), art(2, 'sport'), art(3, null), art(4, 'nyheter', true)],
    });
    expect(plan.kind).toBe('single');
    const xml = plan.xml;
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(
      '<url><loc>https://elvebyen.no/</loc><lastmod>2026-09-03T12:00:00.000Z</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>',
    );
    expect(xml).toContain('<loc>https://elvebyen.no/nyheter</loc>');
    expect(xml).toContain('<loc>https://elvebyen.no/sport</loc>');
    expect(xml).toContain('<loc>https://elvebyen.no/nyheter/sak-1</loc>');
    expect(xml).toContain('<loc>https://elvebyen.no/sport/sak-2</loc>');
    expect(xml).toContain('<loc>https://elvebyen.no/a/00000000-0000-4000-8000-000000000003</loc>');
    expect(xml).not.toContain('sak-4');
    expect((xml.match(/<url>/g) ?? []).length).toBe(6);
    expect((xml.match(/<\/url>/g) ?? []).length).toBe(6);
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });

  it('switches to a sitemap index above the threshold and renders the parts', () => {
    const many = Array.from({ length: SITEMAP_SPLIT_THRESHOLD + 1 }, (_, i) =>
      art(i, i % 2 ? 'sport' : 'nyheter'),
    );
    many.push(art(99_999, null));
    const index = buildSitemap({
      baseUrl: 'https://elvebyen.no',
      sections: [section('nyheter'), section('sport')],
      articles: many,
    });
    expect(index.kind).toBe('index');
    expect(index.xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(index.xml).toContain('<loc>https://elvebyen.no/sitemap.xml?del=base</loc>');
    expect(index.xml).toContain('<loc>https://elvebyen.no/nyheter/sitemap.xml</loc>');
    expect(index.xml).toContain('<loc>https://elvebyen.no/sport/sitemap.xml</loc>');

    const basePart = buildSitemap({
      baseUrl: 'https://elvebyen.no',
      sections: [section('nyheter')],
      articles: many,
      part: 'base',
    });
    expect(basePart.kind).toBe('single');
    expect(basePart.xml).toContain('<loc>https://elvebyen.no/</loc>');
    expect(basePart.xml).toContain('/a/00000000-0000-4000-8000-000000099999');
    expect(basePart.xml).not.toContain('/nyheter/sak-0');
  });

  it('escapes URLs and caps the number of entries', () => {
    const xml = buildUrlSet([{ loc: 'https://x.no/a?b=1&c=2' }]);
    expect(xml).toContain('<loc>https://x.no/a?b=1&amp;c=2</loc>');
    expect(
      buildSitemapIndex([{ loc: 'https://x.no/s.xml', lastmod: new Date('2026-01-01T00:00:00Z') }]),
    ).toContain(
      '<sitemap><loc>https://x.no/s.xml</loc><lastmod>2026-01-01T00:00:00.000Z</lastmod></sitemap>',
    );
  });
});

describe('buildRobots', () => {
  it('points at the sitemap and blocks admin and api', () => {
    const txt = buildRobots('https://elvebyen.no');
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api');
    expect(txt).toContain('Sitemap: https://elvebyen.no/sitemap.xml');
  });
});
