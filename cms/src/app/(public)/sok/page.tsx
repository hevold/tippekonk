/**
 * Search page: form + results with ts_headline highlights, an empty state
 * and pagination. Uses websearch_to_tsquery('norwegian') so "skolene" finds
 * "skole" and quoted phrases / minus words work like readers expect.
 */
import type { Metadata } from 'next';

import { JsonLd } from '@/components/public/json-ld';
import { PageHeading } from '@/components/public/page-heading';
import { PublicPagination } from '@/components/public/pagination';
import { SearchForm } from '@/components/public/search-form';
import { Teaser, teaserHref } from '@/components/public/teaser';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { formatNumber } from '@/lib/text';
import { firstParam, getPublicPageContext, pageParam } from '@/server/public/context';
import { breadcrumbJsonLd } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { searchArticles, type HeadlineSegment } from '@/server/public/queries';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function cleanQuery(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const ctx = await getPublicPageContext();
  const q = cleanQuery(firstParam((await searchParams).q));
  return listMetadata(ctx.meta, {
    title: q ? t('public.search.resultsFor', { q }) : t('public.search.title'),
    description: t('public.search.description', { site: ctx.site.name }),
    path: publicPaths.search(q || undefined),
    noIndex: true,
  });
}

function Headline({ segments }: { segments: HeadlineSegment[] }) {
  if (!segments.length) return null;
  return (
    <p className="search-hit text-muted mt-1 text-sm leading-snug">
      {segments.map((s, i) => (s.highlight ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </p>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const ctx = await getPublicPageContext();
  const q = cleanQuery(firstParam(sp.q));
  const page = pageParam(sp.side);
  const tooShort = q.length > 0 && q.length < 2;
  const result =
    q.length >= 2
      ? await searchArticles(ctx.site.id, q, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      : { items: [], total: 0 };
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const hrefFor = (p: number) => `${publicPaths.search(q)}${p > 1 ? `&side=${p}` : ''}`;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
          { name: t('public.search.title'), url: `${ctx.baseUrl}${publicPaths.search()}` },
        ])}
      />
      <PageHeading
        eyebrow={t('public.search.title')}
        title={q ? t('public.search.resultsFor', { q }) : t('public.search.heading')}
        description={
          q && !tooShort
            ? t('public.search.count', { count: result.total, n: formatNumber(result.total) })
            : t('public.search.prompt')
        }
      >
        <SearchForm
          siteName={ctx.site.name}
          initialQuery={q}
          size="large"
          className="mt-5 max-w-2xl"
          autoFocus={!q}
        />
        {tooShort ? (
          <p role="alert" className="text-danger mt-3 text-sm">
            {t('public.search.tooShort')}
          </p>
        ) : null}
      </PageHeading>

      {q && !tooShort ? (
        result.items.length ? (
          <section aria-label={t('public.search.results')}>
            <ol className="divide-border m-0 flex list-none flex-col divide-y p-0">
              {result.items.map((hit) => (
                <li key={hit.id} className="py-5 first:pt-0">
                  <Teaser
                    article={hit}
                    variant="list"
                    showLead={false}
                    showBylines
                    plusLabel={ctx.settings.paywall.label}
                    imageSizes="(min-width: 640px) 160px, 33vw"
                  />
                  <div className="mt-1 sm:pl-[calc(9rem+0.75rem)]">
                    <Headline segments={hit.headline} />
                    {hit.sectionName ? (
                      <a
                        href={hit.sectionSlug ? publicPaths.section(hit.sectionSlug) : teaserHref(hit)}
                        className="mt-1 inline-block text-xs font-semibold text-[var(--site-primary)] hover:underline"
                      >
                        {hit.sectionName}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <PublicPagination page={page} pageCount={pageCount} hrefFor={hrefFor} className="mt-10" />
          </section>
        ) : (
          <div className="py-12 text-center">
            <p className="font-heading text-xl font-semibold">{t('public.search.empty', { q })}</p>
            <p className="text-muted mt-2">{t('public.search.emptyHelp')}</p>
          </div>
        )
      ) : null}
    </>
  );
}
