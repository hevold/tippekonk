/**
 * `generateMetadata` helpers for the public pages (SPEC 7): title suffix
 * from settings, description fallback, canonical, Open Graph / Twitter
 * with the featured image, `robots noindex` when an article says so.
 */
import 'server-only';

import type { Metadata } from 'next';

import type { Media, Site } from '@/db/schema';
import type { SiteSettings } from '@/lib/validation/site';
import { mediaUrl } from '@/server/media/urls';

import type { PublicArticle } from './queries';
import { absoluteUrl } from './urls';

export type MetaContext = {
  site: Pick<Site, 'name' | 'tagline' | 'locale'>;
  settings: SiteSettings;
  baseUrl: string;
  /** Site-wide fallback image for sharing. */
  defaultImage: Media | null;
};

export function ogLocale(locale: string): string {
  return locale === 'nn' ? 'nn_NO' : 'nb_NO';
}

export function titleSuffix(ctx: Pick<MetaContext, 'site' | 'settings'>): string {
  return ctx.settings.seo.titleSuffix || ` – ${ctx.site.name}`;
}

export function pageTitle(
  ctx: Pick<MetaContext, 'site' | 'settings'>,
  title: string | null | undefined,
): string {
  return title ? `${title}${titleSuffix(ctx)}` : ctx.site.name;
}

function ogImage(ctx: MetaContext, media: Media | null | undefined) {
  const m = media && media.kind === 'image' ? media : ctx.defaultImage;
  if (!m || m.kind !== 'image') return undefined;
  return [
    {
      url: absoluteUrl(ctx.baseUrl, mediaUrl(m, 1280)),
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      alt: m.alt ?? undefined,
    },
  ];
}

/** Metadata for listing pages (front, section, tag, author, search). */
export function listMetadata(
  ctx: MetaContext,
  input: {
    title: string | null;
    description?: string | null;
    path: string;
    image?: Media | null;
    noIndex?: boolean;
  },
): Metadata {
  const description =
    input.description || ctx.settings.seo.defaultDescription || ctx.site.tagline || undefined;
  const url = absoluteUrl(ctx.baseUrl, input.path);
  const images = ogImage(ctx, input.image);
  const title = pageTitle(ctx, input.title);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: input.noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      type: 'website',
      siteName: ctx.site.name,
      locale: ogLocale(ctx.site.locale),
      title,
      description,
      url,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: images?.map((i) => i.url),
      site: ctx.settings.seo.twitterHandle || undefined,
    },
  };
}

/** Metadata for the article page. */
export function articleMetadata(ctx: MetaContext, article: PublicArticle, canonicalPath: string): Metadata {
  const title = pageTitle(ctx, article.seoTitle || article.title);
  const description =
    article.seoDescription || article.lead || ctx.settings.seo.defaultDescription || undefined;
  const canonical =
    article.canonicalUrl && /^https?:\/\//.test(article.canonicalUrl)
      ? article.canonicalUrl
      : absoluteUrl(ctx.baseUrl, canonicalPath);
  const images = ogImage(ctx, article.featuredMedia);
  const published = (article.firstPublishedAt ?? article.publishedAt)?.toISOString();
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    robots: article.noIndex ? { index: false, follow: true } : undefined,
    authors: article.bylines.map((b) => ({
      name: b.name,
      url: absoluteUrl(ctx.baseUrl, `/skribent/${b.slug}`),
    })),
    keywords: article.tags.map((t) => t.name),
    openGraph: {
      type: 'article',
      siteName: ctx.site.name,
      locale: ogLocale(ctx.site.locale),
      title,
      description,
      url: canonical,
      images,
      publishedTime: published,
      modifiedTime: article.updatedAt.toISOString(),
      section: article.section?.name,
      tags: article.tags.map((t) => t.name),
      authors: article.bylines.map((b) => b.name),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title,
      description,
      images: images?.map((i) => i.url),
      site: ctx.settings.seo.twitterHandle || undefined,
    },
    other: article.section ? { 'article:section': article.section.name } : undefined,
  };
}
