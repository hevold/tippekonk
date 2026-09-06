/**
 * Response builders shared by the route handlers: RSS (site and section),
 * sitemap (single, index and per-section parts) and robots.txt. Route files
 * stay one-liners; the logic lives here so it is testable and the section
 * and site variants cannot drift apart.
 */
import 'server-only';

import { t } from '@/lib/i18n';

import { getPublicPageContext } from './context';
import { buildRss } from './feeds';
import { docToFeedHtml } from './html';
import { getSectionBySlug, listFeedArticles, listSitemapArticles, type FeedArticle } from './queries';
import { buildRobots, buildSitemap, buildUrlSet, articleEntries } from './sitemap';

const XML_HEADERS = { 'Content-Type': 'application/xml; charset=utf-8' };
const RSS_HEADERS = { 'Content-Type': 'application/rss+xml; charset=utf-8' };
const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8' };

function renderBodyFor(baseUrl: string) {
  return (article: FeedArticle): string =>
    docToFeedHtml(article.body, {
      baseUrl,
      media: new Map(Object.entries(article.bodyMedia)),
      articles: new Map(Object.entries(article.bodyArticles)),
    });
}

export async function rssResponse(sectionSlug?: string): Promise<Response> {
  const ctx = await getPublicPageContext();
  const section = sectionSlug ? await getSectionBySlug(ctx.site.id, sectionSlug) : null;
  if (sectionSlug && !section) return new Response('Not found', { status: 404, headers: TEXT_HEADERS });
  const items = await listFeedArticles(ctx.site.id, {
    sectionId: section?.id,
    limit: ctx.settings.feeds.itemCount,
  });
  const xml = buildRss({
    site: ctx.site,
    settings: ctx.settings,
    baseUrl: ctx.baseUrl,
    feedPath: section ? `/${section.slug}/rss.xml` : '/rss.xml',
    section: section ? { name: section.name, slug: section.slug, description: section.description } : null,
    items,
    logo: ctx.chrome.logo,
    renderBody: renderBodyFor(ctx.baseUrl),
    plusNotice: t('public.feed.plusNotice'),
  });
  return new Response(xml, {
    status: 200,
    headers: { ...RSS_HEADERS, 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}

export async function sitemapResponse(opts: {
  part?: string | null;
  sectionSlug?: string;
}): Promise<Response> {
  const ctx = await getPublicPageContext();
  const articles = await listSitemapArticles(ctx.site.id);
  if (opts.sectionSlug) {
    const section = await getSectionBySlug(ctx.site.id, opts.sectionSlug);
    if (!section) return new Response('Not found', { status: 404, headers: TEXT_HEADERS });
    const own = articles.filter((a) => a.sectionSlug === section.slug);
    const xml = buildUrlSet(articleEntries(ctx.baseUrl, own));
    return new Response(xml, {
      status: 200,
      headers: { ...XML_HEADERS, 'Cache-Control': 'public, s-maxage=600' },
    });
  }
  const plan = buildSitemap({
    baseUrl: ctx.baseUrl,
    sections: ctx.chrome.sections,
    articles,
    part: opts.part === 'base' ? 'base' : null,
  });
  return new Response(plan.xml, {
    status: 200,
    headers: { ...XML_HEADERS, 'Cache-Control': 'public, s-maxage=600' },
  });
}

export async function robotsResponse(): Promise<Response> {
  const ctx = await getPublicPageContext();
  return new Response(buildRobots(ctx.baseUrl), {
    status: 200,
    headers: { ...TEXT_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}
