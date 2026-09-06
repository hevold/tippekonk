/**
 * Author page: author card (photo, title, bio, contact) followed by the
 * author's published articles, paginated with ?side=.
 */
import { Mail, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MediaImage } from '@/components/media/media-image';
import { JsonLd } from '@/components/public/json-ld';
import { PageHeading } from '@/components/public/page-heading';
import { PublicPagination } from '@/components/public/pagination';
import { Teaser } from '@/components/public/teaser';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getPublicPageContext, pageParam } from '@/server/public/context';
import { breadcrumbJsonLd, type JsonLdObject } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { countTeasers, getAuthorBySlug, listTeasers } from '@/server/public/queries';
import { absoluteUrl } from '@/server/public/urls';
import { mediaUrl } from '@/server/media/urls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 18;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getPublicPageContext();
  const author = await getAuthorBySlug(ctx.site.id, slug);
  if (!author) return { title: t('public.notFound.title') };
  const page = pageParam((await searchParams).side);
  return listMetadata(ctx.meta, {
    title: author.name,
    description: author.bio || t('public.author.description', { name: author.name, site: ctx.site.name }),
    path: page > 1 ? `${publicPaths.author(author.slug)}?side=${page}` : publicPaths.author(author.slug),
    image: author.image,
    noIndex: page > 1,
  });
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getPublicPageContext();
  const author = await getAuthorBySlug(ctx.site.id, slug);
  if (!author) notFound();
  const page = pageParam(sp.side);
  const [items, total] = await Promise.all([
    listTeasers(ctx.site.id, { authorId: author.id, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    countTeasers(ctx.site.id, { authorId: author.id }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount && total > 0) notFound();
  const url = absoluteUrl(ctx.baseUrl, publicPaths.author(author.slug));

  const person: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': `${url}#person`,
    name: author.name,
    url,
    jobTitle: author.title || undefined,
    description: author.bio || undefined,
    email: author.email || undefined,
    image:
      author.image && author.image.kind === 'image'
        ? absoluteUrl(ctx.baseUrl, mediaUrl(author.image, 640))
        : undefined,
    worksFor: { '@id': `${ctx.baseUrl}/#organization` },
  };

  return (
    <>
      <JsonLd
        data={[
          person,
          breadcrumbJsonLd([
            { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
            { name: author.name, url },
          ]),
        ]}
      />
      <PageHeading
        eyebrow={author.title || t('public.author.heading')}
        title={author.name}
        description={author.bio}
        image={
          author.image ? (
            <MediaImage
              media={author.image}
              alt={author.name}
              aspect="1/1"
              sizes="112px"
              targetWidth={224}
              className="size-20 shrink-0 rounded-full md:size-28"
            />
          ) : (
            <span
              aria-hidden
              className="bg-surface-3 font-heading text-muted flex size-20 shrink-0 items-center justify-center rounded-full text-2xl font-semibold md:size-28"
            >
              {author.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .join('')}
            </span>
          )
        }
        actions={
          author.email || author.phone ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {author.email ? (
                <li>
                  <a
                    href={`mailto:${author.email}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <Mail aria-hidden className="text-muted size-4" />
                    {author.email}
                  </a>
                </li>
              ) : null}
              {author.phone ? (
                <li>
                  <a
                    href={`tel:${author.phone.replace(/\s+/g, '')}`}
                    className="inline-flex items-center gap-1.5 hover:underline"
                  >
                    <Phone aria-hidden className="text-muted size-4" />
                    {author.phone}
                  </a>
                </li>
              ) : null}
            </ul>
          ) : undefined
        }
      />
      <h2 className="font-heading mb-4 border-b-2 border-[var(--site-primary)] pb-1.5 text-lg font-bold">
        {t('public.author.articles', { name: author.name })}
      </h2>
      {items.length ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a, i) => (
            <Teaser
              key={a.id}
              article={a}
              variant="card"
              showLead
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
        hrefFor={(p) =>
          p === 1 ? publicPaths.author(author.slug) : `${publicPaths.author(author.slug)}?side=${p}`
        }
        className="mt-10"
      />
    </>
  );
}
