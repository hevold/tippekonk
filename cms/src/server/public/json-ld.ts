/**
 * Schema.org JSON-LD builders for the public site (SPEC 7): NewsArticle,
 * BreadcrumbList, Organization (front page) and WebSite with a
 * SearchAction. Pure functions returning plain objects; the page renders
 * them with `<JsonLd>` which escapes `<` so a title can never close the
 * script element.
 */
import type { Media, Site } from '@/db/schema';
import type { SiteSettings } from '@/lib/validation/site';
import { mediaUrl } from '@/server/media/urls';

import type { PublicArticle } from './queries';
import { absoluteUrl } from './paths';

export type JsonLdObject = Record<string, unknown> & { '@context': 'https://schema.org'; '@type': string };

export type SiteInfo = {
  site: Pick<Site, 'name' | 'tagline'>;
  settings: SiteSettings;
  baseUrl: string;
  logo: Media | null;
};

function imageUrl(baseUrl: string, media: Media | null | undefined): string | undefined {
  if (!media || media.kind !== 'image') return undefined;
  return absoluteUrl(baseUrl, mediaUrl(media, 1280));
}

function socialLinks(settings: SiteSettings): string[] {
  return Object.values(settings.social).filter(
    (v): v is string => typeof v === 'string' && /^https?:\/\//.test(v),
  );
}

export function organizationJsonLd(info: SiteInfo): JsonLdObject {
  const logo = imageUrl(info.baseUrl, info.logo);
  const out: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'NewsMediaOrganization',
    '@id': `${info.baseUrl}/#organization`,
    name: info.site.name,
    url: `${info.baseUrl}/`,
  };
  if (info.site.tagline) out.description = info.site.tagline;
  if (logo) out.logo = { '@type': 'ImageObject', url: logo };
  const same = socialLinks(info.settings);
  if (same.length) out.sameAs = same;
  const { contact, editorial } = info.settings;
  if (contact.address || contact.city) {
    out.address = {
      '@type': 'PostalAddress',
      streetAddress: contact.address || undefined,
      postalCode: contact.postalCode || undefined,
      addressLocality: contact.city || undefined,
      addressCountry: 'NO',
    };
  }
  if (contact.email) out.email = contact.email;
  if (contact.phone) out.telephone = contact.phone;
  if (editorial.publisher) out.parentOrganization = { '@type': 'Organization', name: editorial.publisher };
  if (editorial.editorialPolicyUrl)
    out.ethicsPolicy = absoluteUrl(info.baseUrl, editorial.editorialPolicyUrl);
  return out;
}

export function webSiteJsonLd(info: SiteInfo): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${info.baseUrl}/#website`,
    name: info.site.name,
    url: `${info.baseUrl}/`,
    inLanguage: 'nb-NO',
    publisher: { '@id': `${info.baseUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${info.baseUrl}/sok?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type BreadcrumbItem = { name: string; url: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function newsArticleJsonLd(
  article: PublicArticle,
  info: SiteInfo,
  opts: { url: string; paywalled: boolean },
): JsonLdObject {
  const image = imageUrl(info.baseUrl, article.featuredMedia);
  const bodyImages = Object.values(article.bodyMedia)
    .map((m) => imageUrl(info.baseUrl, m))
    .filter((u): u is string => Boolean(u));
  const images = [image, ...bodyImages].filter((u): u is string => Boolean(u));
  const logo = imageUrl(info.baseUrl, info.logo);
  const authors = article.bylines
    .filter((b) => b.role === 'text' || article.bylines.length === 1)
    .map((b) => ({ '@type': 'Person', name: b.name, url: `${info.baseUrl}/skribent/${b.slug}` }));

  const out: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': article.contentType.key === 'opinion' ? 'OpinionNewsArticle' : 'NewsArticle',
    '@id': opts.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
    url: opts.url,
    headline: article.title.slice(0, 110),
    description: article.seoDescription || article.lead || undefined,
    datePublished: (article.firstPublishedAt ?? article.publishedAt)?.toISOString(),
    dateModified: article.updatedAt.toISOString(),
    inLanguage: 'nb-NO',
    isAccessibleForFree: !opts.paywalled,
    author: authors.length ? authors : { '@type': 'Organization', name: info.site.name },
    publisher: {
      '@type': 'NewsMediaOrganization',
      '@id': `${info.baseUrl}/#organization`,
      name: info.site.name,
      ...(logo ? { logo: { '@type': 'ImageObject', url: logo } } : {}),
    },
  };
  if (images.length) out.image = images;
  if (article.section) out.articleSection = article.section.name;
  if (article.tags.length) out.keywords = article.tags.map((t) => t.name).join(', ');
  if (article.wordCount > 0) out.wordCount = article.wordCount;
  if (opts.paywalled) {
    out.hasPart = {
      '@type': 'WebPageElement',
      isAccessibleForFree: false,
      cssSelector: '.paywalled',
    };
  }
  if (article.isSponsored) out.sponsor = { '@type': 'Organization', name: 'Annonsør' };
  return out;
}

/** Serialize for a <script type="application/ld+json">; `<` is escaped so content cannot end the script. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
