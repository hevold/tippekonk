/**
 * Renders a `ResolvedLayout` (front page / section page) as rows of grid
 * columns with one component per block type. Server-safe. Every block type
 * from src/lib/layout/types.ts is handled here; unknown types render
 * nothing rather than throwing.
 */
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { publicPaths } from '@/config/routes';
import { emptyRenderContext, renderDoc } from '@/lib/content/render';
import { sanitizeDoc } from '@/lib/content/schema';
import { formatRelative, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type {
  ArticleTeaser,
  LiveBlogSummary,
  ResolvedBlock,
  ResolvedLayout,
  ResolvedRow,
} from '@/lib/layout/engine';
import type { LayoutBlockSettings } from '@/lib/layout/types';
import { cn } from '@/lib/utils';

import { LiveLabel } from './labels';
import { Teaser, type TeaserOptions } from './teaser';

export type LayoutRendererProps = {
  layout: ResolvedLayout;
  /** Section id → slug/name, so section-feed headers can link. */
  sections?: { id: string; slug: string; name: string }[];
  plusLabel?: string;
  className?: string;
};

const COLUMN_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 lg:grid-cols-4',
};

const SPAN_CLASS: Record<number, string> = {
  1: '',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-2 lg:col-span-4',
};

const BACKGROUND_CLASS: Record<NonNullable<ResolvedRow['background']>, string> = {
  none: '',
  muted: 'bg-surface-2 rounded-[var(--site-radius)] px-4 py-5 md:px-6 md:py-6',
  accent:
    'bg-[var(--site-primary)] text-white rounded-[var(--site-radius)] px-4 py-5 md:px-6 md:py-6 [&_a]:text-white [&_.text-muted]:text-white/80 [&_.text-text]:text-white',
};

export function BlockHeader({
  title,
  href,
  className,
}: {
  title?: string;
  href?: string;
  className?: string;
}) {
  if (!title) return null;
  return (
    <div
      className={cn(
        'mb-3 flex items-baseline justify-between gap-3 border-b-2 border-[var(--site-primary)] pb-1.5',
        className,
      )}
    >
      <h2 className="font-heading text-lg font-bold tracking-tight">
        {href ? (
          <a href={href} className="hover:underline">
            {title}
          </a>
        ) : (
          title
        )}
      </h2>
      {href ? (
        <a
          href={href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--site-primary)] hover:underline"
        >
          {t('public.seeAll')}
          <ArrowRight aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function teaserOptions(s: LayoutBlockSettings, plusLabel?: string): TeaserOptions {
  return {
    showImage: s.showImages,
    showLead: s.showLead,
    showKicker: s.showKicker,
    showBylines: s.showBylines,
    plusLabel,
  };
}

function Empty({ block }: { block: ResolvedBlock }) {
  return <div className="hidden" data-block-id={block.id} data-block-type={block.type} data-empty="true" />;
}

function ListBlock({
  block,
  articles,
  opts,
  numbered,
}: {
  block: ResolvedBlock;
  articles: ArticleTeaser[];
  opts: TeaserOptions;
  numbered?: boolean;
}) {
  const Tag = numbered ? 'ol' : 'ul';
  return (
    <Tag className="divide-border m-0 flex list-none flex-col divide-y p-0">
      {articles.map((a, i) => (
        <li key={a.id} className="py-3 first:pt-0 last:pb-0">
          <Teaser
            article={a}
            variant={block.settings.showImages && !numbered ? 'list' : 'compact'}
            {...opts}
            number={numbered ? i + 1 : undefined}
          />
        </li>
      ))}
    </Tag>
  );
}

function CardGrid({
  articles,
  opts,
  columns,
  firstPriority,
}: {
  articles: ArticleTeaser[];
  opts: TeaserOptions;
  columns: number;
  firstPriority?: boolean;
}) {
  const cols = Math.max(1, Math.min(4, columns));
  const gridClass =
    cols === 1
      ? 'grid-cols-1'
      : cols === 2
        ? 'sm:grid-cols-2'
        : cols === 3
          ? 'sm:grid-cols-2 lg:grid-cols-3'
          : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className={cn('grid grid-cols-1 gap-6', gridClass)}>
      {articles.map((a, i) => (
        <Teaser key={a.id} article={a} variant="card" {...opts} priority={firstPriority && i === 0} />
      ))}
    </div>
  );
}

function LiveCard({ live }: { live: LiveBlogSummary }) {
  const ended = live.status === 'ended';
  return (
    <a
      href={publicPaths.live(live.slug)}
      className="group border-border bg-surface flex flex-col gap-1.5 rounded-[var(--site-radius)] border p-4 transition-colors hover:border-[var(--site-accent)]"
    >
      <span className="flex items-center gap-2">
        <LiveLabel ended={ended} />
        <span className="text-muted text-xs">{ended ? t('public.liveEnded') : t('public.liveNow')}</span>
      </span>
      <span className="font-heading text-lg leading-tight font-semibold group-hover:underline">
        {live.title}
      </span>
      {live.description ? <span className="text-muted text-sm">{live.description}</span> : null}
      <time dateTime={toIso(live.updatedAt)} className="text-muted text-xs">
        {t('public.updated')} {formatRelative(live.updatedAt)}
      </time>
    </a>
  );
}

export function LayoutBlock({
  block,
  rowColumns,
  sections,
  plusLabel,
  firstPriority,
}: {
  block: ResolvedBlock;
  rowColumns: number;
  sections: LayoutRendererProps['sections'];
  plusLabel?: string;
  firstPriority?: boolean;
}) {
  const s = block.settings;
  const opts = teaserOptions(s, plusLabel);
  const span = Math.max(1, Math.min(rowColumns, block.span ?? 1));
  const widthCols = Math.max(1, Math.round((span / rowColumns) * 3));
  const section = s.sectionId ? sections?.find((x) => x.id === s.sectionId) : undefined;
  const articles = block.articles;

  let content: ReactNode = null;
  switch (block.type) {
    case 'hero': {
      const [first, ...rest] = articles;
      if (!first) return <Empty block={block} />;
      content = (
        <>
          <Teaser
            article={first}
            variant="hero"
            {...opts}
            priority={firstPriority}
            imageSizes={span === rowColumns ? '(min-width: 1280px) 1200px, 100vw' : undefined}
          />
          {rest.length ? (
            <div className="mt-6">
              <CardGrid articles={rest} opts={opts} columns={Math.min(3, rest.length)} />
            </div>
          ) : null}
        </>
      );
      break;
    }
    case 'top-stories': {
      const [first, ...rest] = articles;
      if (!first) return <Empty block={block} />;
      content = (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Teaser article={first} variant="hero" {...opts} priority={firstPriority} headingLevel={2} />
          </div>
          <div className="divide-border flex flex-col divide-y">
            {rest.map((a) => (
              <div key={a.id} className="py-3 first:pt-0 last:pb-0">
                <Teaser article={a} variant="list" {...opts} showLead={false} />
              </div>
            ))}
          </div>
        </div>
      );
      break;
    }
    case 'grid':
    case 'plus': {
      if (!articles.length) return <Empty block={block} />;
      content = (
        <CardGrid
          articles={articles}
          opts={opts}
          columns={Math.min(widthCols, articles.length)}
          firstPriority={firstPriority}
        />
      );
      break;
    }
    case 'list':
    case 'latest': {
      if (!articles.length) return <Empty block={block} />;
      content =
        widthCols >= 3 && s.showImages ? (
          <CardGrid articles={articles} opts={opts} columns={Math.min(4, articles.length)} />
        ) : (
          <ListBlock block={block} articles={articles} opts={opts} />
        );
      break;
    }
    case 'most-read': {
      if (!articles.length) return <Empty block={block} />;
      content = <ListBlock block={block} articles={articles} opts={{ ...opts, showImage: false }} numbered />;
      break;
    }
    case 'section-feed':
    case 'tag-feed': {
      const [first, ...rest] = articles;
      if (!first) return <Empty block={block} />;
      content =
        widthCols >= 3 ? (
          <CardGrid articles={articles} opts={opts} columns={Math.min(4, articles.length)} />
        ) : (
          <>
            <Teaser article={first} variant="card" {...opts} />
            {rest.length ? (
              <ul className="divide-border mt-4 flex list-none flex-col divide-y p-0">
                {rest.map((a) => (
                  <li key={a.id} className="py-2.5 last:pb-0">
                    <Teaser article={a} variant="compact" {...opts} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        );
      break;
    }
    case 'opinion': {
      if (!articles.length) return <Empty block={block} />;
      content = (
        <div
          className={cn(
            'grid grid-cols-1 gap-6',
            widthCols >= 3 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2',
          )}
        >
          {articles.map((a) => (
            <Teaser
              key={a.id}
              article={a}
              variant="card"
              {...opts}
              showImage={s.showImages === true}
              authorEmphasis
              showBylines
            />
          ))}
        </div>
      );
      break;
    }
    case 'live': {
      const lives = block.liveBlogs ?? [];
      if (!lives.length) return <Empty block={block} />;
      content = (
        <div
          className={cn('grid grid-cols-1 gap-4', lives.length > 1 && widthCols >= 2 ? 'sm:grid-cols-2' : '')}
        >
          {lives.map((l) => (
            <LiveCard key={l.id} live={l} />
          ))}
        </div>
      );
      break;
    }
    case 'newsletter': {
      const href = s.href || '/nyhetsbrev';
      content = (
        <div className="flex flex-col gap-3 rounded-[var(--site-radius)] bg-[var(--site-primary)] p-6 text-white">
          <span className="font-heading text-xl font-bold">{s.title || t('public.newsletter.title')}</span>
          <p className="text-sm text-white/85">
            {typeof s.text === 'string' && s.text ? s.text : t('public.newsletter.text')}
          </p>
          <a
            href={href}
            className="inline-flex w-fit items-center rounded-[var(--site-radius)] bg-white px-4 py-2 text-sm font-semibold text-[var(--site-primary)] hover:bg-white/90"
          >
            {t('public.newsletter.cta')}
          </a>
        </div>
      );
      return (
        <div
          className={cn('min-w-0', SPAN_CLASS[span])}
          data-block-id={block.id}
          data-block-type={block.type}
        >
          {content}
        </div>
      );
    }
    case 'ad': {
      return (
        <div
          className={cn(
            'border-border text-subtle flex min-h-32 min-w-0 flex-col items-center justify-center rounded-[var(--site-radius)] border border-dashed text-xs tracking-wide uppercase print:hidden',
            SPAN_CLASS[span],
          )}
          data-block-id={block.id}
          data-block-type="ad"
          data-slot-id={s.slotId ?? ''}
          aria-label={t('public.ad')}
        >
          {t('public.ad')}
        </div>
      );
    }
    case 'text': {
      const doc = sanitizeDoc(
        typeof s.text === 'string'
          ? { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: s.text }] }] }
          : s.text,
      );
      if (!doc.content.length) return <Empty block={block} />;
      return (
        <div
          className={cn('prose-article min-w-0', SPAN_CLASS[span])}
          data-block-id={block.id}
          data-block-type="text"
        >
          {s.title ? <h2 className="font-heading text-xl font-bold">{s.title}</h2> : null}
          {renderDoc(doc, emptyRenderContext({ embeds: 'placeholder' }))}
        </div>
      );
    }
    case 'heading': {
      if (!s.title) return <Empty block={block} />;
      return (
        <div
          className={cn('min-w-0 border-b-2 border-[var(--site-primary)] pb-1', SPAN_CLASS[span])}
          data-block-id={block.id}
          data-block-type="heading"
        >
          <h2 className="font-heading text-2xl font-bold tracking-tight">{s.title}</h2>
        </div>
      );
    }
    default:
      return <Empty block={block} />;
  }

  const headerHref =
    block.type === 'section-feed' && section
      ? publicPaths.section(section.slug)
      : block.type === 'tag-feed' && s.tagId
        ? undefined
        : undefined;
  const headerTitle =
    s.title ||
    (block.type === 'section-feed' && section ? section.name : undefined) ||
    (block.type === 'most-read' ? t('public.mostRead') : undefined) ||
    (block.type === 'opinion' ? t('public.opinion') : undefined) ||
    (block.type === 'latest' ? t('public.latest') : undefined);

  return (
    <section
      className={cn('min-w-0', SPAN_CLASS[span])}
      data-block-id={block.id}
      data-block-type={block.type}
      aria-label={headerTitle}
    >
      <BlockHeader title={headerTitle} href={headerHref} />
      {content}
    </section>
  );
}

/** The first block with an image-bearing article gets the eager (LCP) image. */
export function lcpBlockId(layout: ResolvedLayout): string | null {
  for (const row of layout.rows) {
    for (const block of row.blocks) {
      if (
        block.articles.length > 0 &&
        block.settings.showImages !== false &&
        block.articles[0]?.featuredMedia
      ) {
        return block.id;
      }
    }
  }
  return null;
}

export function LayoutRenderer({ layout, sections, plusLabel, className }: LayoutRendererProps) {
  const lcpId = lcpBlockId(layout);
  return (
    <div className={cn('flex flex-col gap-10 md:gap-12', className)}>
      {layout.rows.map((row) => {
        const columns = (row.columns >= 1 && row.columns <= 4 ? row.columns : 1) as 1 | 2 | 3 | 4;
        return (
          <div key={row.id} className={cn(BACKGROUND_CLASS[row.background ?? 'none'])} data-row-id={row.id}>
            {row.title ? (
              <h2 className="font-heading mb-4 text-2xl font-bold tracking-tight">{row.title}</h2>
            ) : null}
            <div className={cn('grid grid-cols-1 gap-8 md:gap-6', COLUMN_CLASS[columns])}>
              {row.blocks.map((block) => (
                <LayoutBlock
                  key={block.id}
                  block={block}
                  rowColumns={columns}
                  sections={sections}
                  plusLabel={plusLabel}
                  firstPriority={block.id === lcpId}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
