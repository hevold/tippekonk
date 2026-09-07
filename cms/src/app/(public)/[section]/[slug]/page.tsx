/**
 * Article page (SPEC 7). Looks the article up by section + slug; on a miss
 * it consults the redirects table (SPEC 5.3), then tries the slug in any
 * section (301 to the canonical path after a section move), and finally
 * 404s. Renders <ArticlePage> with NewsArticle + BreadcrumbList JSON-LD and
 * the pageview beacon.
 */
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';

import { ArticlePage } from '@/components/public/article-page';
import { JsonLd } from '@/components/public/json-ld';
import { PageviewBeacon } from '@/components/public/pageview-beacon';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getPublicPageContext } from '@/server/public/context';
import { breadcrumbJsonLd, newsArticleJsonLd } from '@/server/public/json-ld';
import { articleMetadata } from '@/server/public/metadata';
import { redirectIfMoved } from '@/server/public/moved';
import { getArticleByPath, getArticleBySlug, getRelated } from '@/server/public/queries';
import { absoluteUrl } from '@/server/public/urls';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ section: string; slug: string }> };

const lookup = cache(async (siteId: string, section: string, slug: string) =>
  getArticleByPath(siteId, section, slug),
);

/** Article for the path, or a redirect / 404 (never returns null). */
async function resolveArticle(siteId: string, section: string, slug: string) {
  const article = await lookup(siteId, section, slug);
  if (article) return article;

  const path = `/${section}/${slug}`;
  await redirectIfMoved(siteId, path);
  const moved = await getArticleBySlug(siteId, slug);
  if (moved) {
    const canonical = publicPaths.article(moved.section?.slug, moved.section ? moved.slug : moved.id);
    if (canonical !== path) permanentRedirect(canonical);
  }
  notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section, slug } = await params;
  const ctx = await getPublicPageContext();
  const article = await lookup(ctx.site.id, section, slug);
  if (!article) return { title: t('public.notFound.title') };
  return articleMetadata(ctx.meta, article, publicPaths.article(section, slug));
}

export default async function ArticleRoute({ params }: Props) {
  const { section, slug } = await params;
  const ctx = await getPublicPageContext();
  const article = await resolveArticle(ctx.site.id, section, slug);
  const path = publicPaths.article(section, slug);
  const url = absoluteUrl(ctx.baseUrl, path);
  const readAlso = await getRelated(
    ctx.site.id,
    { id: article.id, sectionId: article.section?.id ?? null },
    4,
  );

  const sections = ctx.chrome.sections;
  const parent = article.section?.parentId ? sections.find((s) => s.id === article.section?.parentId) : null;
  const crumbs = [
    { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
    ...(parent
      ? [{ name: parent.name, url: absoluteUrl(ctx.baseUrl, publicPaths.section(parent.slug)) }]
      : []),
    ...(article.section
      ? [
          {
            name: article.section.name,
            url: absoluteUrl(ctx.baseUrl, publicPaths.section(article.section.slug)),
          },
        ]
      : []),
    { name: article.title, url },
  ];
  const paywalled = article.access === 'plus' && ctx.settings.paywall.enabled;

  return (
    <>
      <JsonLd data={[newsArticleJsonLd(article, ctx.jsonLd, { url, paywalled }), breadcrumbJsonLd(crumbs)]} />
      <nav aria-label={t('public.breadcrumbs')} className="text-muted mx-auto mb-4 max-w-3xl text-xs">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
          {crumbs.slice(0, -1).map((c, i) => (
            <li key={c.url} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              <a href={c.url} className="hover:underline">
                {c.name}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      <ArticlePage article={article} settings={ctx.settings} url={url} readAlso={readAlso} />
      <PageviewBeacon articleId={article.id} />
    </>
  );
}
