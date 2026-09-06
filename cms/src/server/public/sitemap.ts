/**
 * Sitemap builders (SPEC 7). Small sites get one `urlset` with the front
 * page, every section and every published article. Above
 * `SITEMAP_SPLIT_THRESHOLD` articles, `/sitemap.xml` becomes a sitemap index
 * pointing at `/sitemap.xml?del=base` (front, sections, section-less
 * articles) and `/<section>/sitemap.xml` per section. Pure functions.
 */
import type { Section } from '@/db/schema';

import { escapeXml } from './feeds';
import type { SitemapArticle } from './queries';
import { absoluteUrl } from './paths';

export const SITEMAP_SPLIT_THRESHOLD = 2000;
/** Hard cap per sitemap file, per the protocol. */
export const SITEMAP_MAX_URLS = 50_000;

export type SitemapEntry = {
  loc: string;
  lastmod?: Date | null;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  priority?: number;
};

export function articleLoc(baseUrl: string, a: Pick<SitemapArticle, 'id' | 'slug' | 'sectionSlug'>): string {
  return absoluteUrl(baseUrl, a.sectionSlug ? `/${a.sectionSlug}/${a.slug}` : `/a/${a.id}`);
}

function entryXml(e: SitemapEntry): string {
  const parts = [`<loc>${escapeXml(e.loc)}</loc>`];
  if (e.lastmod) parts.push(`<lastmod>${e.lastmod.toISOString()}</lastmod>`);
  if (e.changefreq) parts.push(`<changefreq>${e.changefreq}</changefreq>`);
  if (typeof e.priority === 'number') parts.push(`<priority>${e.priority.toFixed(1)}</priority>`);
  return `<url>${parts.join('')}</url>`;
}

export function buildUrlSet(entries: SitemapEntry[]): string {
  const body = entries.slice(0, SITEMAP_MAX_URLS).map(entryXml).join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  );
}

export function buildSitemapIndex(sitemaps: { loc: string; lastmod?: Date | null }[]): string {
  const body = sitemaps
    .map(
      (s) =>
        `<sitemap><loc>${escapeXml(s.loc)}</loc>${s.lastmod ? `<lastmod>${s.lastmod.toISOString()}</lastmod>` : ''}</sitemap>`,
    )
    .join('\n');
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`
  );
}

export function articleEntries(baseUrl: string, articles: SitemapArticle[]): SitemapEntry[] {
  return articles
    .filter((a) => !a.noIndex)
    .map((a) => ({
      loc: articleLoc(baseUrl, a),
      lastmod: a.updatedAt > (a.publishedAt ?? a.updatedAt) ? a.updatedAt : a.publishedAt,
      changefreq: 'weekly' as const,
      priority: 0.6,
    }));
}

/** Front page + section pages. */
export function baseEntries(baseUrl: string, sections: Section[], newest: Date | null): SitemapEntry[] {
  return [
    { loc: `${baseUrl}/`, lastmod: newest, changefreq: 'hourly', priority: 1 },
    ...sections.map((s) => ({
      loc: absoluteUrl(baseUrl, `/${s.slug}`),
      lastmod: newest,
      changefreq: 'daily' as const,
      priority: 0.8,
    })),
  ];
}

export function newestDate(articles: SitemapArticle[]): Date | null {
  let newest: Date | null = null;
  for (const a of articles) {
    const d = a.updatedAt;
    if (d && (!newest || d > newest)) newest = d;
  }
  return newest;
}

export type SitemapPlan = { kind: 'single'; xml: string } | { kind: 'index'; xml: string };

/**
 * Decide between a single urlset and an index. `part === 'base'` renders the
 * base part of a split sitemap regardless of size.
 */
export function buildSitemap(input: {
  baseUrl: string;
  sections: Section[];
  articles: SitemapArticle[];
  part?: 'base' | null;
}): SitemapPlan {
  const { baseUrl, sections, articles } = input;
  const newest = newestDate(articles);
  const split = articles.length > SITEMAP_SPLIT_THRESHOLD;
  if (!split && input.part !== 'base') {
    return {
      kind: 'single',
      xml: buildUrlSet([...baseEntries(baseUrl, sections, newest), ...articleEntries(baseUrl, articles)]),
    };
  }
  if (input.part === 'base') {
    const orphans = articles.filter((a) => !a.sectionSlug);
    return {
      kind: 'single',
      xml: buildUrlSet([...baseEntries(baseUrl, sections, newest), ...articleEntries(baseUrl, orphans)]),
    };
  }
  const bySection = new Map<string, Date | null>();
  for (const a of articles) {
    if (!a.sectionSlug) continue;
    const prev = bySection.get(a.sectionSlug) ?? null;
    bySection.set(a.sectionSlug, !prev || a.updatedAt > prev ? a.updatedAt : prev);
  }
  const sitemaps = [
    { loc: absoluteUrl(baseUrl, '/sitemap.xml?del=base'), lastmod: newest },
    ...[...bySection.entries()].map(([slug, lastmod]) => ({
      loc: absoluteUrl(baseUrl, `/${slug}/sitemap.xml`),
      lastmod,
    })),
  ];
  return { kind: 'index', xml: buildSitemapIndex(sitemaps) };
}

export function buildRobots(baseUrl: string): string {
  return [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /api',
    'Disallow: /sok',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl(baseUrl, '/sitemap.xml')}`,
    '',
  ].join('\n');
}
