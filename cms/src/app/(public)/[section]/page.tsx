/**
 * Section page: a published `section:<id>` layout when the desk has made
 * one, otherwise an automatic listing — section header, child-section
 * chips, a card grid of the newest articles (including child sections)
 * paginated with ?side=2. An unknown slug consults the redirects table
 * (SPEC 5.3) before it 404s, so single-segment legacy paths redirect too.
 */
import { Rss } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/public/json-ld';
import { LayoutRenderer } from '@/components/public/layout-renderer';
import { ChipList, PageHeading } from '@/components/public/page-heading';
import { PublicPagination } from '@/components/public/pagination';
import { Teaser } from '@/components/public/teaser';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getPublicPageContext, pageParam } from '@/server/public/context';
import { breadcrumbJsonLd } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { redirectIfMoved } from '@/server/public/moved';
import { countTeasers, getSectionBySlug, getSectionLayout, listTeasers } from '@/server/public/queries';
import { absoluteUrl } from '@/server/public/urls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 18;

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { section: slug } = await params;
  const ctx = await getPublicPageContext();
  const section = await getSectionBySlug(ctx.site.id, slug);
  if (!section) return { title: t('public.notFound.title') };
  const page = pageParam((await searchParams).side);
  const path =
    page > 1 ? `${publicPaths.section(section.slug)}?side=${page}` : publicPaths.section(section.slug);
  return {
    ...listMetadata(ctx.meta, {
      title: section.seoTitle || section.name,
      description:
        section.seoDescription ||
        section.description ||
        t('public.section.description', { section: section.name, site: ctx.site.name }),
      path,
      noIndex: page > 1,
    }),
    alternates: {
      canonical: absoluteUrl(ctx.baseUrl, path),
      types: {
        'application/rss+xml': [
          { url: publicPaths.rss(section.slug), title: `${ctx.site.name} – ${section.name}` },
        ],
      },
    },
  };
}

export default async function SectionPage({ params, searchParams }: Props) {
  const { section: slug } = await params;
  const sp = await searchParams;
  const ctx = await getPublicPageContext();
  const section = await getSectionBySlug(ctx.site.id, slug);
  if (!section) {
    await redirectIfMoved(ctx.site.id, publicPaths.section(slug));
    notFound();
  }

  const all = ctx.chrome.sections;
  const parent = section.parentId ? all.find((s) => s.id === section.parentId) : null;
  const children = all.filter((s) => s.parentId === section.id);
  const siblings = parent ? all.filter((s) => s.parentId === parent.id) : [];
  const chips = (children.length ? children : siblings).map((s) => ({
    href: publicPaths.section(s.slug),
    label: s.name,
    active: s.id === section.id,
  }));

  const page = pageParam(sp.side);
  const layout = page === 1 ? await getSectionLayout(ctx.site.id, section.id) : null;

  const crumbs = [
    { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
    ...(parent
      ? [{ name: parent.name, url: absoluteUrl(ctx.baseUrl, publicPaths.section(parent.slug)) }]
      : []),
    { name: section.name, url: absoluteUrl(ctx.baseUrl, publicPaths.section(section.slug)) },
  ];

  const heading = (
    <PageHeading
      eyebrow={parent ? parent.name : undefined}
      title={section.name}
      description={section.description}
      actions={
        <a
          href={publicPaths.rss(section.slug)}
          type="application/rss+xml"
          className="border-border hover:bg-surface-2 inline-flex h-9 items-center gap-1.5 rounded-[var(--site-radius)] border px-3 text-sm font-medium"
        >
          <Rss aria-hidden className="size-4" />
          <span>RSS</span>
          <span className="sr-only"> – {t('public.section.rss', { section: section.name })}</span>
        </a>
      }
    >
      <ChipList items={chips} label={t('public.section.subsections')} />
    </PageHeading>
  );

  if (
    layout &&
    layout.rows.some((r) =>
      r.blocks.some(
        (b) =>
          b.articles.length ||
          b.liveBlogs?.length ||
          ['newsletter', 'text', 'heading', 'ad'].includes(b.type),
      ),
    )
  ) {
    return (
      <>
        <JsonLd data={breadcrumbJsonLd(crumbs)} />
        {heading}
        <LayoutRenderer
          layout={layout}
          sections={all.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))}
          plusLabel={ctx.settings.paywall.label}
        />
      </>
    );
  }

  const [items, total] = await Promise.all([
    listTeasers(ctx.site.id, { sectionId: section.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countTeasers(ctx.site.id, { sectionId: section.id }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount && total > 0) notFound();

  return (
    <>
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {heading}
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
              className={
                i === 0 && page === 1
                  ? 'sm:col-span-2 lg:col-span-3 [&_h3]:text-2xl md:[&_h3]:text-3xl'
                  : undefined
              }
              imageSizes={i === 0 && page === 1 ? '(min-width: 1280px) 1200px, 100vw' : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted py-16 text-center">{t('public.section.empty')}</p>
      )}
      <PublicPagination
        page={page}
        pageCount={pageCount}
        hrefFor={(p) =>
          p === 1 ? publicPaths.section(section.slug) : `${publicPaths.section(section.slug)}?side=${p}`
        }
        className="mt-10"
      />
    </>
  );
}
