/**
 * RSS 2.0 feed builder (SPEC 7): Atom-compatible `<atom:link rel="self">`,
 * `dc:creator` per byline, `media:content` for the featured image,
 * `category` per section/tag, full `content:encoded` when
 * `settings.feeds.fullContent` — except for plus articles, which only ever
 * carry the lead (SPEC 5.6).
 *
 * Pure: the route hands in the articles, the base URL and a body renderer
 * (docToFeedHtml) so this module has no React or database dependency and can be
 * unit-tested with plain string assertions.
 */
import type { Media, Site } from '@/db/schema';
import type { SiteSettings } from '@/lib/validation/site';
import { mediaUrl } from '@/server/media/urls';

import type { FeedArticle } from './queries';
import { absoluteUrl } from './paths';

export type FeedInput = {
  site: Pick<Site, 'name' | 'tagline' | 'locale'>;
  settings: SiteSettings;
  baseUrl: string;
  /** Path of this feed, e.g. "/rss.xml" or "/sport/rss.xml". */
  feedPath: string;
  /** The section for section feeds. */
  section?: { name: string; slug: string; description: string | null } | null;
  items: FeedArticle[];
  logo?: Media | null;
  /** Renders the body to HTML for full-content feeds. */
  renderBody: (article: FeedArticle) => string;
  /** Text appended to plus-article descriptions. */
  plusNotice: string;
  /** Stable "now" for lastBuildDate (tests). */
  now?: Date;
};

export function escapeXml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Wrap HTML in CDATA, splitting any "]]>" so the section cannot be closed early. */
export function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

export function rfc822(date: Date | null | undefined): string {
  return (date ?? new Date(0)).toUTCString();
}

export function articlePath(article: Pick<FeedArticle, 'id' | 'slug' | 'sectionSlug'>): string {
  return article.sectionSlug ? `/${article.sectionSlug}/${article.slug}` : `/a/${article.id}`;
}

function feedLanguage(locale: string): string {
  return locale === 'nn' ? 'nn' : 'nb';
}

function mediaElement(baseUrl: string, media: Media | null): string {
  if (!media || media.kind !== 'image') return '';
  const url = absoluteUrl(baseUrl, mediaUrl(media, 1280));
  const attrs = [
    `url="${escapeXml(url)}"`,
    `type="${escapeXml(media.mime)}"`,
    'medium="image"',
    media.width ? `width="${media.width}"` : '',
    media.height ? `height="${media.height}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const children = [
    media.alt ? `<media:description type="plain">${escapeXml(media.alt)}</media:description>` : '',
    media.credit
      ? `<media:credit role="photographer" scheme="urn:ebu">${escapeXml(media.credit)}</media:credit>`
      : '',
  ].join('');
  return `<media:content ${attrs}>${children}</media:content>`;
}

function itemXml(input: FeedInput, article: FeedArticle): string {
  const link = absoluteUrl(input.baseUrl, articlePath(article));
  const isPlus = article.access === 'plus';
  const fullContent = input.settings.feeds.fullContent && !isPlus;
  const description = [article.lead ?? '', isPlus && input.settings.paywall.enabled ? input.plusNotice : '']
    .filter(Boolean)
    .join(' ');
  const parts: string[] = [
    `<title>${escapeXml(article.kicker ? `${article.kicker}: ${article.title}` : article.title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `<pubDate>${rfc822(article.publishedAt)}</pubDate>`,
    `<description>${escapeXml(description)}</description>`,
  ];
  for (const b of article.bylines) parts.push(`<dc:creator>${escapeXml(b.name)}</dc:creator>`);
  if (article.sectionName) parts.push(`<category>${escapeXml(article.sectionName)}</category>`);
  for (const tag of article.tags) parts.push(`<category>${escapeXml(tag)}</category>`);
  parts.push(mediaElement(input.baseUrl, article.featuredMedia));
  if (fullContent) {
    const html = input.renderBody(article);
    if (html) parts.push(`<content:encoded>${cdata(html)}</content:encoded>`);
  }
  return `<item>${parts.filter(Boolean).join('')}</item>`;
}

/** Build the complete RSS document. */
export function buildRss(input: FeedInput): string {
  const { site, settings, baseUrl, section } = input;
  const title = section ? `${site.name} – ${section.name}` : site.name;
  const description = section
    ? section.description || `Siste saker fra ${section.name} i ${site.name}`
    : site.tagline || settings.seo.defaultDescription || `Siste saker fra ${site.name}`;
  const selfUrl = absoluteUrl(baseUrl, input.feedPath);
  const homeUrl = section ? absoluteUrl(baseUrl, `/${section.slug}`) : `${baseUrl}/`;
  const now = input.now ?? new Date();
  const newest = input.items.reduce<Date | null>((acc, a) => {
    const d = a.publishedAt;
    return d && (!acc || d > acc) ? d : acc;
  }, null);
  const logo =
    input.logo && input.logo.kind === 'image' ? absoluteUrl(baseUrl, mediaUrl(input.logo, 640)) : null;

  const channel = [
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(homeUrl)}</link>`,
    `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escapeXml(description)}</description>`,
    `<language>${feedLanguage(site.locale)}</language>`,
    `<lastBuildDate>${rfc822(newest ?? now)}</lastBuildDate>`,
    `<generator>Desken</generator>`,
    `<ttl>15</ttl>`,
    settings.editorial.publisher
      ? `<copyright>${escapeXml(`© ${now.getUTCFullYear()} ${settings.editorial.publisher}`)}</copyright>`
      : '',
    settings.contact.email
      ? `<managingEditor>${escapeXml(`${settings.contact.email} (${settings.editorial.responsibleEditor || site.name})`)}</managingEditor>`
      : '',
    logo
      ? `<image><url>${escapeXml(logo)}</url><title>${escapeXml(title)}</title><link>${escapeXml(homeUrl)}</link></image>`
      : '',
    ...input.items.map((a) => itemXml(input, a)),
  ]
    .filter(Boolean)
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">\n` +
    `<channel>\n${channel}\n</channel>\n</rss>\n`
  );
}
