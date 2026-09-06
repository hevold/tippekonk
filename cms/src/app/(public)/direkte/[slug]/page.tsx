/**
 * Public live blog page (/direkte/[slug]). Server-renders the posts (pinned
 * first), a key-event summary box and the LIVE badge; the client <LiveFeed>
 * then polls for new posts. Ended blogs render read-only with an
 * "avsluttet" notice. Emits LiveBlogPosting JSON-LD.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { KeyEvents } from '@/components/live/key-events';
import { LiveFeed } from '@/components/live/live-feed';
import { JsonLd } from '@/components/public/json-ld';
import { LiveLabel } from '@/components/public/labels';
import { publicPaths } from '@/config/routes';
import { docToPlainText } from '@/lib/content/text';
import { formatDate, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { toPostDto, getPublicLiveBlog } from '@/server/live';
import { mediaUrl } from '@/server/media/urls';
import { getPublicPageContext } from '@/server/public/context';
import { breadcrumbJsonLd, type JsonLdObject } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { absoluteUrl } from '@/server/public/urls';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getPublicPageContext();
  const result = await getPublicLiveBlog(ctx.site.id, slug);
  if (!result) return { title: t('public.notFound.title') };
  return listMetadata(ctx.meta, {
    title: result.blog.title,
    description: result.blog.description,
    path: publicPaths.live(result.blog.slug),
  });
}

export default async function LiveBlogPage({ params }: Props) {
  const { slug } = await params;
  const ctx = await getPublicPageContext();
  const result = await getPublicLiveBlog(ctx.site.id, slug);
  if (!result) notFound();
  const { blog, posts, keyEvents, media, article } = result;
  const ended = blog.status === 'ended';
  const url = absoluteUrl(ctx.baseUrl, publicPaths.live(blog.slug));
  const loadedAt = new Date().toISOString();
  const postDtos = posts.map(toPostDto);
  const keyEventDtos = keyEvents.map(toPostDto);
  const lastUpdate =
    posts.reduce<Date | null>((max, p) => (!max || p.updatedAt > max ? p.updatedAt : max), null) ??
    blog.updatedAt;

  const liveBlogJsonLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'LiveBlogPosting',
    headline: blog.title,
    description: blog.description ?? undefined,
    url,
    mainEntityOfPage: url,
    datePublished: toIso(blog.startedAt ?? blog.createdAt),
    dateModified: toIso(lastUpdate),
    coverageStartTime: toIso(blog.startedAt ?? blog.createdAt),
    ...(blog.endedAt ? { coverageEndTime: toIso(blog.endedAt) } : {}),
    publisher: {
      '@type': 'NewsMediaOrganization',
      name: ctx.site.name,
      ...(ctx.chrome.logo
        ? { logo: { '@type': 'ImageObject', url: absoluteUrl(ctx.baseUrl, mediaUrl(ctx.chrome.logo, 640)) } }
        : {}),
    },
    liveBlogUpdate: [...posts]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, 100)
      .map((p) => ({
        '@type': 'BlogPosting',
        ...(p.title ? { headline: p.title } : {}),
        articleBody: docToPlainText(p.body).slice(0, 2000),
        datePublished: toIso(p.publishedAt),
        dateModified: toIso(p.updatedAt),
        url: `${url}#innlegg-${p.id}`,
        ...(p.authorName ? { author: { '@type': 'Person', name: p.authorName } } : {}),
      })),
  };

  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        data={[
          liveBlogJsonLd,
          breadcrumbJsonLd([
            { name: t('public.frontPage'), url: `${ctx.baseUrl}/` },
            { name: blog.title, url },
          ]),
        ]}
      />
      <header className="border-border mb-6 border-b pb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <LiveLabel ended={ended} />
          <span className="text-muted">
            {ended ? t('live.public.endedStatus') : t('live.public.liveStatus')}
          </span>
          {blog.startedAt ? (
            <span className="text-muted">
              · {t('live.public.startedAt')}{' '}
              <time dateTime={toIso(blog.startedAt)}>{formatDate(blog.startedAt, 'datetime')}</time>
            </span>
          ) : null}
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
          {blog.title}
        </h1>
        {blog.description ? <p className="text-muted mt-3 text-lg">{blog.description}</p> : null}
        {article ? (
          <p className="mt-3 text-sm">
            <Link
              href={article.path}
              className="font-medium text-[var(--site-primary)] underline-offset-2 hover:underline"
            >
              {t('live.public.readArticle', { title: article.title })}
            </Link>
          </p>
        ) : null}
      </header>

      {ended ? (
        <p
          role="status"
          className="bg-surface-2 border-border mb-8 rounded-[var(--site-radius)] border px-4 py-3 text-sm"
        >
          {t('live.public.endedNotice')}
          {blog.endedAt ? (
            <>
              {' '}
              <time dateTime={toIso(blog.endedAt)} className="text-muted">
                ({formatDate(blog.endedAt, 'datetime')})
              </time>
            </>
          ) : null}
        </p>
      ) : null}

      <KeyEvents events={keyEventDtos} title={t('live.public.keyEvents')} />

      <LiveFeed
        blogId={blog.id}
        status={blog.status}
        initialPosts={postDtos}
        initialMedia={Object.fromEntries(media)}
        loadedAt={loadedAt}
        pollIntervalSec={ctx.settings.live.pollIntervalSec}
      />
    </article>
  );
}
