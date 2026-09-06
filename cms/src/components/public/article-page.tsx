/**
 * The article page body (SPEC 7): kicker, title, lead, bylines with photo
 * credit, published/updated timestamps, featured image with caption and
 * credit, body via renderDoc, paywall teaser for plus articles, sponsored
 * label, tags, share buttons, editorially related articles and "Les også"
 * from the same section. Used by both the public route and the admin
 * preview, so it takes everything as props and reads nothing itself.
 */
import { Clock } from 'lucide-react';

import { MediaImage } from '@/components/media/media-image';
import { publicPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { renderDoc, type RenderContext } from '@/lib/content/render';
import { docFirstParagraphs, docParagraphCount } from '@/lib/content/text';
import { formatDate, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type { ArticleTeaser } from '@/lib/layout/engine';
import { formatNumber } from '@/lib/text';
import type { SiteSettings } from '@/lib/validation/site';
import { cn } from '@/lib/utils';
import type { PublicArticle, PublicByline } from '@/server/public/queries';

import { BreakingLabel, PlusLabel, SponsoredLabel } from './labels';
import { PaywallBox } from './paywall-box';
import { ShareButtons } from './share-buttons';
import { Teaser } from './teaser';

export type ArticlePageProps = {
  article: PublicArticle;
  settings: SiteSettings;
  /** Absolute canonical URL (share buttons). */
  url: string;
  /** "Les også": other articles from the same section. */
  readAlso: ArticleTeaser[];
  /** Apply the paywall cut (false in the admin preview). */
  paywall?: boolean;
};

const OPINION_LABELS: Record<string, string> = {
  leder: 'Leder',
  kommentar: 'Kommentar',
  debatt: 'Debattinnlegg',
};

function AuthorPhoto({ image, name, size }: { image: Media | null; name: string; size: number }) {
  return (
    <span
      className="bg-surface-3 font-heading text-muted inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      aria-hidden
    >
      {image ? (
        <MediaImage
          media={image}
          aspect="1/1"
          sizes={`${size}px`}
          targetWidth={size * 2}
          className="h-full w-full"
          decorative
        />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? '')
          .join('')
      )}
    </span>
  );
}

function Bylines({ bylines, emphasis }: { bylines: PublicByline[]; emphasis: boolean }) {
  const text = bylines.filter((b) => b.role !== 'photo');
  const photo = bylines.filter((b) => b.role === 'photo');
  if (!bylines.length) return null;
  if (emphasis) {
    return (
      <div className="flex flex-wrap gap-4">
        {text.map((b) => (
          <a key={b.id} href={publicPaths.author(b.slug)} className="flex items-center gap-3 hover:underline">
            <AuthorPhoto image={b.image} name={b.name} size={56} />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{b.name}</span>
              {b.title ? <span className="text-muted text-sm">{b.title}</span> : null}
            </span>
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {text.length ? (
        <span className="flex flex-wrap items-center gap-2">
          <span className="flex -space-x-2">
            {text.slice(0, 3).map((b) => (
              <AuthorPhoto key={b.id} image={b.image} name={b.name} size={32} />
            ))}
          </span>
          <span>
            <span className="text-muted">{t('public.by')} </span>
            {text.map((b, i) => (
              <span key={b.id}>
                {i > 0 ? (i === text.length - 1 ? ' og ' : ', ') : null}
                <a href={publicPaths.author(b.slug)} className="font-semibold hover:underline">
                  {b.name}
                </a>
                {b.role !== 'text' && t(`public.bylineRole.${b.role}`) ? (
                  <span className="text-muted"> ({t(`public.bylineRole.${b.role}`)})</span>
                ) : null}
              </span>
            ))}
          </span>
        </span>
      ) : null}
      {photo.length ? (
        <span className="text-muted">
          {t('public.photo')}:{' '}
          {photo.map((b, i) => (
            <span key={b.id}>
              {i > 0 ? ', ' : null}
              <a href={publicPaths.author(b.slug)} className="text-text font-medium hover:underline">
                {b.name}
              </a>
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

export function ArticlePage({ article, settings, url, readAlso, paywall = true }: ArticlePageProps) {
  const isPlus = article.access === 'plus';
  const paywalled = paywall && isPlus && settings.paywall.enabled;
  const teaserCount = settings.paywall.teaserParagraphs;
  const bodyDoc = paywalled ? docFirstParagraphs(article.body, teaserCount) : article.body;
  const hidesContent = paywalled && docParagraphCount(article.body) > teaserCount;
  const isOpinion = article.contentType.template === 'opinion' || article.contentType.key === 'opinion';
  const standpoint =
    typeof article.customFields.standpoint === 'string' ? article.customFields.standpoint : '';
  const opinionLabel = isOpinion ? OPINION_LABELS[standpoint] || article.contentType.name : null;

  const publishedAt = article.publishedAt ?? article.firstPublishedAt ?? article.updatedAt;
  const showUpdated =
    settings.reading.showUpdatedAt &&
    article.publishedAt &&
    article.updatedAt.getTime() - article.publishedAt.getTime() > 5 * 60_000;

  const renderCtx: RenderContext = {
    media: new Map(Object.entries(article.bodyMedia)),
    articles: new Map(Object.entries(article.bodyArticles)),
    liveBlogs: new Map(Object.entries(article.bodyLiveBlogs)),
    imageSizes: '(min-width: 1024px) 720px, 100vw',
  };

  const featured = article.featuredMedia;
  const featuredCaption = article.featuredCaption || featured?.caption || '';
  const featuredCredit = article.featuredCredit || featured?.credit || '';
  const readAlsoList = readAlso.filter(
    (a) => a.id !== article.id && !article.related.some((r) => r.id === a.id),
  );

  return (
    <article
      className={cn('site-article', paywalled && 'paywalled')}
      data-article-id={article.id}
      data-content-type={article.contentType.key}
      itemScope
      itemType={isOpinion ? 'https://schema.org/OpinionNewsArticle' : 'https://schema.org/NewsArticle'}
    >
      <header className="mx-auto max-w-3xl">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {article.isBreaking ? <BreakingLabel /> : null}
          {isPlus ? <PlusLabel label={settings.paywall.label} /> : null}
          {article.isSponsored ? <SponsoredLabel /> : null}
          {opinionLabel ? (
            <span className="text-xs font-bold tracking-wide text-[var(--site-accent)] uppercase">
              {opinionLabel}
            </span>
          ) : article.kicker ? (
            <span className="text-xs font-bold tracking-wide text-[var(--site-accent)] uppercase">
              {article.kicker}
            </span>
          ) : null}
          {opinionLabel && article.kicker ? (
            <span className="text-muted text-xs font-semibold">{article.kicker}</span>
          ) : null}
        </div>
        <h1
          className="font-heading text-3xl leading-[1.1] font-bold tracking-tight text-balance md:text-5xl"
          itemProp="headline"
        >
          {article.title}
        </h1>
        {article.lead ? (
          <p className="font-body text-muted mt-4 text-lg leading-snug md:text-xl" itemProp="description">
            {article.lead}
          </p>
        ) : null}
        {article.isSponsored ? (
          <p className="border-border bg-surface-2 text-muted mt-4 rounded-[var(--site-radius)] border px-3 py-2 text-xs">
            {t('public.sponsoredExplainer')}
          </p>
        ) : null}
        <div className="border-border mt-5 flex flex-col gap-3 border-y py-3">
          <Bylines bylines={article.bylines} emphasis={isOpinion} />
          <div
            className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
            aria-label={t('public.article.time')}
          >
            <span>
              {t('public.published')}{' '}
              <time dateTime={toIso(publishedAt)} itemProp="datePublished">
                {formatDate(publishedAt, 'datetime')}
              </time>
            </span>
            {showUpdated ? (
              <span>
                {t('public.updated')}{' '}
                <time dateTime={toIso(article.updatedAt)} itemProp="dateModified">
                  {formatDate(article.updatedAt, 'datetime')}
                </time>
              </span>
            ) : null}
            {settings.reading.showReadingTime ? (
              <span className="inline-flex items-center gap-1">
                <Clock aria-hidden className="size-3.5" />
                {t('public.readingTime', { minutes: article.readingTimeMin })}
              </span>
            ) : null}
            {settings.reading.showWordCount && article.wordCount > 0 ? (
              <span>{t('public.article.words', { count: formatNumber(article.wordCount) })}</span>
            ) : null}
          </div>
        </div>
      </header>

      {featured ? (
        <figure className="mx-auto mt-6 max-w-4xl" aria-label={t('public.article.featuredImage')}>
          <MediaImage
            media={featured}
            sizes="(min-width: 1024px) 896px, 100vw"
            aspect="16/9"
            priority
            targetWidth={1280}
            className="rounded-[var(--site-radius)]"
          />
          {featuredCaption || featuredCredit ? (
            <figcaption className="text-muted mt-2 text-sm">
              {featuredCaption ? <span>{featuredCaption}</span> : null}
              {featuredCaption && featuredCredit ? ' ' : null}
              {featuredCredit ? (
                <span className="text-subtle text-xs tracking-wide uppercase">{featuredCredit}</span>
              ) : null}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="mx-auto mt-8 max-w-3xl">
        <div className="prose-article mx-auto" itemProp="articleBody">
          {renderDoc(bodyDoc, renderCtx)}
        </div>
        {hidesContent ? <PaywallBox paywall={settings.paywall} /> : null}
        {paywalled && !hidesContent ? <PaywallBox paywall={settings.paywall} /> : null}

        {article.tags.length ? (
          <nav aria-label={t('public.tags')} className="mt-10">
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {article.tags.map((tag) => (
                <li key={tag.id}>
                  <a
                    href={publicPaths.tag(tag.slug)}
                    className="border-border hover:bg-surface-2 inline-flex h-8 items-center rounded-full border px-3 text-sm font-medium"
                    rel="tag"
                  >
                    {tag.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="border-border mt-8 flex flex-col gap-3 border-t pt-6">
          <span className="text-muted text-xs font-bold tracking-wide uppercase">{t('public.share')}</span>
          <ShareButtons url={url} title={article.title} text={article.lead} />
        </div>
      </div>

      {article.related.length ? (
        <aside className="mx-auto mt-12 max-w-3xl" aria-label={t('public.related')}>
          <h2 className="font-heading mb-4 border-b-2 border-[var(--site-primary)] pb-1.5 text-lg font-bold">
            {t('public.related')}
          </h2>
          <ul className="divide-border m-0 flex list-none flex-col divide-y p-0">
            {article.related.map((r) => (
              <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                <Teaser article={r} variant="list" plusLabel={settings.paywall.label} showLead={false} />
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {readAlsoList.length ? (
        <aside className="mx-auto mt-12 max-w-5xl" aria-label={t('public.readAlso')}>
          <h2 className="font-heading mb-4 border-b-2 border-[var(--site-primary)] pb-1.5 text-lg font-bold">
            {article.section ? (
              <a href={publicPaths.section(article.section.slug)} className="hover:underline">
                {t('public.moreFrom', { section: article.section.name })}
              </a>
            ) : (
              t('public.readAlso')
            )}
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {readAlsoList.map((r) => (
              <Teaser
                key={r.id}
                article={r}
                variant="card"
                plusLabel={settings.paywall.label}
                showLead={false}
              />
            ))}
          </div>
        </aside>
      ) : null}
    </article>
  );
}
