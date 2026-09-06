/**
 * Article teasers for the public site. One component, four variants:
 *
 *   hero     — full-width story with a large image, kicker, lead and bylines
 *   card     — image on top, title, optional lead (grids, section feeds)
 *   list     — small thumbnail to the left, title and time (lists, feeds)
 *   compact  — title and time only (latest, most-read with a number)
 *
 * Server-safe: no hooks. Every image goes through <MediaImage> with a
 * `sizes` attribute and an aspect box so nothing shifts while loading.
 */
import type { ReactNode } from 'react';

import { MediaImage } from '@/components/media/media-image';
import { publicPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { formatRelative, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type { ArticleTeaser } from '@/lib/layout/engine';
import { cn } from '@/lib/utils';

import { BreakingLabel, PlusLabel, SponsoredLabel } from './labels';

export type TeaserVariant = 'hero' | 'card' | 'list' | 'compact';

export type TeaserOptions = {
  showImage?: boolean;
  showLead?: boolean;
  showKicker?: boolean;
  showBylines?: boolean;
  /** Eager-load the image (LCP candidate). */
  priority?: boolean;
  /** Numbered list position (most-read). */
  number?: number;
  /** Emphasise the author (opinion blocks). */
  authorEmphasis?: boolean;
  /** Label text for plus articles (settings.paywall.label). */
  plusLabel?: string;
  /** Heading level for the title; defaults per variant. */
  headingLevel?: 2 | 3 | 4;
  className?: string;
  imageSizes?: string;
};

export type TeaserProps = TeaserOptions & { article: ArticleTeaser; variant?: TeaserVariant };

type BylineLike = { name: string; slug: string; image?: Media | null; title?: string | null };

export function teaserHref(article: Pick<ArticleTeaser, 'id' | 'slug' | 'sectionSlug'>): string {
  return publicPaths.article(article.sectionSlug, article.sectionSlug ? article.slug : article.id);
}

function Heading({
  level,
  className,
  children,
}: {
  level: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  if (level === 2) return <h2 className={className}>{children}</h2>;
  if (level === 4) return <h4 className={className}>{children}</h4>;
  return <h3 className={className}>{children}</h3>;
}

export function TeaserLabels({
  article,
  plusLabel,
  className,
}: {
  article: ArticleTeaser;
  plusLabel?: string;
  className?: string;
}) {
  const labels: ReactNode[] = [];
  if (article.isBreaking) labels.push(<BreakingLabel key="breaking" />);
  if (article.access === 'plus') labels.push(<PlusLabel key="plus" label={plusLabel} />);
  if (article.isSponsored) labels.push(<SponsoredLabel key="sponsored" />);
  if (!labels.length) return null;
  return <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>{labels}</span>;
}

export function TeaserTime({ article, className }: { article: ArticleTeaser; className?: string }) {
  const date = article.publishedAt ?? article.updatedAt;
  return (
    <time dateTime={toIso(date)} className={cn('text-muted text-xs', className)}>
      {formatRelative(date)}
    </time>
  );
}

export function TeaserBylines({ bylines, className }: { bylines: BylineLike[]; className?: string }) {
  if (!bylines.length) return null;
  return (
    <span className={cn('text-muted text-xs', className)}>
      {t('public.by')}{' '}
      {bylines.map((b, i) => (
        <span key={b.slug}>
          {i > 0 ? (i === bylines.length - 1 ? ' og ' : ', ') : null}
          <span className="text-text font-medium">{b.name}</span>
        </span>
      ))}
    </span>
  );
}

function AuthorFace({ byline, size = 40 }: { byline: BylineLike; size?: number }) {
  return (
    <span
      className="bg-surface-3 font-heading text-muted inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {byline.image ? (
        <MediaImage
          media={byline.image}
          aspect="1/1"
          sizes={`${size}px`}
          targetWidth={size * 2}
          className="h-full w-full"
          decorative
        />
      ) : (
        byline.name
          .split(/\s+/)
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? '')
          .join('')
      )}
    </span>
  );
}

const DEFAULT_SIZES: Record<TeaserVariant, string> = {
  hero: '(min-width: 1280px) 820px, (min-width: 768px) 66vw, 100vw',
  card: '(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw',
  list: '(min-width: 640px) 160px, 33vw',
  compact: '96px',
};

export function Teaser({ article, variant = 'card', ...o }: TeaserProps) {
  const href = teaserHref(article);
  const showImage = o.showImage !== false && Boolean(article.featuredMedia);
  const showKicker = o.showKicker !== false && Boolean(article.kicker);
  const showLead = (o.showLead ?? variant === 'hero') && Boolean(article.lead);
  const showBylines =
    (o.showBylines ?? (variant === 'hero' || o.authorEmphasis)) && article.bylines.length > 0;
  const sizes = o.imageSizes ?? DEFAULT_SIZES[variant];
  const firstByline = article.bylines[0] as BylineLike | undefined;
  const titleClass =
    'font-heading font-semibold leading-tight tracking-tight text-text hover:underline decoration-[var(--site-accent)] underline-offset-4 text-balance';

  if (variant === 'hero') {
    return (
      <article className={cn('teaser teaser-hero group', o.className)} data-article-id={article.id}>
        {showImage && article.featuredMedia ? (
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <MediaImage
              media={article.featuredMedia}
              sizes={sizes}
              aspect="16/9"
              priority={o.priority}
              targetWidth={1280}
              className="rounded-[var(--site-radius)]"
            />
          </a>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TeaserLabels article={article} plusLabel={o.plusLabel} />
            {showKicker ? (
              <span className="text-xs font-bold tracking-wide text-[var(--site-accent)] uppercase">
                {article.kicker}
              </span>
            ) : null}
          </div>
          <Heading
            level={o.headingLevel ?? 2}
            className={cn(titleClass, 'text-3xl md:text-4xl lg:text-[2.75rem]')}
          >
            <a href={href} className="focus-visible:outline-none">
              {article.title}
            </a>
          </Heading>
          {showLead ? (
            <p className="font-body text-muted max-w-3xl text-lg leading-snug">{article.lead}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {showBylines ? <TeaserBylines bylines={article.bylines} /> : null}
            <TeaserTime article={article} />
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'card') {
    return (
      <article
        className={cn('teaser teaser-card group flex flex-col', o.className)}
        data-article-id={article.id}
      >
        {showImage && article.featuredMedia ? (
          <a href={href} tabIndex={-1} aria-hidden className="block">
            <MediaImage
              media={article.featuredMedia}
              sizes={sizes}
              aspect="3/2"
              priority={o.priority}
              targetWidth={640}
              className="rounded-[var(--site-radius)]"
            />
          </a>
        ) : null}
        <div className="mt-3 flex flex-col gap-1.5">
          {o.authorEmphasis && firstByline ? (
            <div className="flex items-center gap-2">
              <AuthorFace byline={firstByline} />
              <span className="text-sm leading-tight">
                <span className="block font-semibold">{firstByline.name}</span>
                {firstByline.title ? (
                  <span className="text-muted block text-xs">{firstByline.title}</span>
                ) : null}
              </span>
            </div>
          ) : null}
          {article.isBreaking || article.access === 'plus' || article.isSponsored || showKicker ? (
            <div className="flex flex-wrap items-center gap-2">
              <TeaserLabels article={article} plusLabel={o.plusLabel} />
              {showKicker ? (
                <span className="text-[0.7rem] font-bold tracking-wide text-[var(--site-accent)] uppercase">
                  {article.kicker}
                </span>
              ) : null}
            </div>
          ) : null}
          <Heading level={o.headingLevel ?? 3} className={cn(titleClass, 'text-xl md:text-[1.35rem]')}>
            <a href={href}>{article.title}</a>
          </Heading>
          {showLead ? <p className="text-muted text-sm leading-snug">{article.lead}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {showBylines && !o.authorEmphasis ? <TeaserBylines bylines={article.bylines} /> : null}
            <TeaserTime article={article} />
          </div>
        </div>
      </article>
    );
  }

  if (variant === 'list') {
    return (
      <article
        className={cn('teaser teaser-list group flex gap-3', o.className)}
        data-article-id={article.id}
      >
        {showImage && article.featuredMedia ? (
          <a href={href} tabIndex={-1} aria-hidden className="block w-28 shrink-0 sm:w-36">
            <MediaImage
              media={article.featuredMedia}
              sizes={sizes}
              aspect="4/3"
              targetWidth={320}
              className="rounded-[var(--site-radius)]"
            />
          </a>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          {article.isBreaking || article.access === 'plus' || article.isSponsored || showKicker ? (
            <div className="flex flex-wrap items-center gap-2">
              <TeaserLabels article={article} plusLabel={o.plusLabel} />
              {showKicker ? (
                <span className="text-[0.7rem] font-bold tracking-wide text-[var(--site-accent)] uppercase">
                  {article.kicker}
                </span>
              ) : null}
            </div>
          ) : null}
          <Heading level={o.headingLevel ?? 3} className={cn(titleClass, 'text-base md:text-lg')}>
            <a href={href}>{article.title}</a>
          </Heading>
          {showLead ? <p className="text-muted text-sm leading-snug">{article.lead}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {showBylines ? <TeaserBylines bylines={article.bylines} /> : null}
            <TeaserTime article={article} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn('teaser teaser-compact group flex items-start gap-3', o.className)}
      data-article-id={article.id}
    >
      {typeof o.number === 'number' ? (
        <span
          aria-hidden
          className="font-heading w-7 shrink-0 text-2xl leading-none font-bold text-[var(--site-accent)] tabular-nums"
        >
          {o.number}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <TeaserLabels article={article} plusLabel={o.plusLabel} />
          {showKicker ? (
            <span className="text-[0.7rem] font-bold tracking-wide text-[var(--site-accent)] uppercase">
              {article.kicker}
            </span>
          ) : null}
        </div>
        <Heading level={o.headingLevel ?? 3} className={cn(titleClass, 'text-base')}>
          <a href={href}>{article.title}</a>
        </Heading>
        <TeaserTime article={article} />
      </div>
    </article>
  );
}
