/**
 * Tag page: every published article carrying the tag, newest first,
 * paginated with ?side=.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/public/json-ld';
import { PageHeading } from '@/components/public/page-heading';
import { PublicPagination } from '@/components/public/pagination';
import { Teaser } from '@/components/public/teaser';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getPublicPageContext, pageParam } from '@/server/public/context';
import { breadcrumbJsonLd } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { countTeasers, getTagBySlug, listTeasers } from '@/server/public/queries';
import { absoluteUrl } from '@/server/public/urls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 18;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getPublicPageContext();
  const tag = await getTagBySlug(ctx.site.id, slug);
  if (!tag) return { title: t('public.notFound.title') };
  const page = pageParam((await searchParams).side);
  return listMetadata(ctx.meta, {
    title: t('public.tag.title', { tag: tag.name }),
    description: tag.description || t('public.tag.description', { tag: tag.name, site: ctx.site.name }),
    path: page > 1 ? `${publicPaths.tag(tag.slug)}?side=${page}` : publicPaths.tag(tag.slug),
    noIndex: page > 1,
  });
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getPublicPageContext();
  const tag = await getTagBySlug(ctx.site.id, slug);
  if (!tag) notFound();
  const page = pageParam(sp.side);
  const [items, total] = await Promise.all([
    listTeasers(ctx.site.id, { tagId: tag.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countTeasers(ctx.site.id, { tagId: tag.id }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount && total > 0) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
          { name: tag.name, url: absoluteUrl(ctx.baseUrl, publicPaths.tag(tag.slug)) },
        ])}
      />
      <PageHeading eyebrow={t('public.tag.heading')} title={tag.name} description={tag.description} />
      {items.length ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a, i) => (
            <Teaser
              key={a.id}
              article={a}
              variant="card"
              showLead
              showBylines
              priority={i === 0}
              plusLabel={ctx.settings.paywall.label}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted py-16 text-center">{t('public.list.empty')}</p>
      )}
      <PublicPagination
        page={page}
        pageCount={pageCount}
        hrefFor={(p) => (p === 1 ? publicPaths.tag(tag.slug) : `${publicPaths.tag(tag.slug)}?side=${p}`)}
        className="mt-10"
      />
    </>
  );
}
