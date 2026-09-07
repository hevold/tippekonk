/**
 * ContentDoc → React. Server-safe (no hooks, no 'use client'); used by the
 * public article page, previews, and `docToHtml()` for feeds and the API.
 *
 * Security model: the document is data, never markup. Text is emitted as
 * React text nodes (escaped), link hrefs are re-checked with `isSafeHref`,
 * and embeds render either as a sandboxed iframe (YouTube, Vimeo, NRK — from
 * a computed embed URL) or as a link card. Unknown node types render their
 * children; malformed nodes render nothing. Nothing here throws on bad input.
 *
 * Class names match `.prose-article` / `.prose-editor` in globals.css.
 */
import { Fragment, type CSSProperties, type ReactNode } from 'react';

import { MediaImage } from '@/components/media/media-image';
import { publicPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { t } from '@/lib/i18n';
import type { ArticleTeaser, LiveBlogSummary } from '@/lib/layout/engine';

import { displayHost, EMBED_PROVIDER_LABELS, embedInfo, isEmbedProvider } from './embed';
import { isSafeHref, safeSrc } from './schema';
import type { ContentDoc, ContentNode, EmbedProvider, Mark } from './types';

export type RenderContext = {
  /** Media referenced by image/gallery nodes, keyed by id (see docMediaIds). */
  media: Map<string, Media>;
  /** Articles referenced by relatedArticles nodes, keyed by id (see docArticleIds). */
  articles: Map<string, ArticleTeaser>;
  /** Live blogs referenced by liveBlog nodes, keyed by id (see docLiveBlogIds). */
  liveBlogs?: Map<string, LiveBlogSummary>;
  /** Rewrite link hrefs (e.g. make relative links absolute for feeds). */
  linkResolver?: (href: string) => string;
  /** 'placeholder' renders every embed as a link card (feeds, previews without third-party content). */
  embeds?: 'full' | 'placeholder';
  /** `sizes` attribute for body images. */
  imageSizes?: string;
  /** Target width for the fallback `src` rendition in `docToHtml()` (default 1280). */
  imageWidth?: number;
};

export { EMBED_PROVIDER_LABELS };

const IFRAME_PROVIDERS: ReadonlySet<EmbedProvider> = new Set<EmbedProvider>(['youtube', 'vimeo', 'nrk']);
const DEFAULT_IMAGE_SIZES = '(min-width: 1024px) 720px, 100vw';

type Attrs = Record<string, unknown>;

function attrs(node: ContentNode): Attrs {
  return node.attrs && typeof node.attrs === 'object' ? node.attrs : {};
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function alignStyle(a: Attrs): CSSProperties | undefined {
  const align = a.textAlign;
  if (align === 'center' || align === 'right') return { textAlign: align };
  return undefined;
}

function resolveHref(href: string, ctx: RenderContext): string {
  return ctx.linkResolver ? ctx.linkResolver(href) : href;
}

/* -------------------------------------------------------------------------- */
/*  Inline                                                                     */
/* -------------------------------------------------------------------------- */

function applyMark(mark: Mark, children: ReactNode, key: string, ctx: RenderContext): ReactNode {
  const a = mark.attrs ?? {};
  switch (mark.type) {
    case 'bold':
      return <strong key={key}>{children}</strong>;
    case 'italic':
      return <em key={key}>{children}</em>;
    case 'underline':
      return <u key={key}>{children}</u>;
    case 'strike':
      return <s key={key}>{children}</s>;
    case 'subscript':
      return <sub key={key}>{children}</sub>;
    case 'superscript':
      return <sup key={key}>{children}</sup>;
    case 'highlight':
      return <mark key={key}>{children}</mark>;
    case 'code':
      return <code key={key}>{children}</code>;
    case 'link': {
      if (!isSafeHref(a.href)) return children;
      const href = resolveHref(a.href.trim(), ctx);
      const blank = a.target === '_blank';
      return (
        <a
          key={key}
          href={href}
          target={blank ? '_blank' : undefined}
          rel={blank ? 'noopener noreferrer' : undefined}
          title={s(a.title) || undefined}
        >
          {children}
        </a>
      );
    }
    default:
      return children;
  }
}

function renderText(node: ContentNode, key: string, ctx: RenderContext): ReactNode {
  const text = node.text ?? '';
  if (!text) return null;
  let out: ReactNode = text;
  const marks = Array.isArray(node.marks) ? node.marks : [];
  // Apply marks inside-out so the link (if any) becomes the outermost element.
  const ordered = [...marks].sort((x, y) => (x.type === 'link' ? 1 : 0) - (y.type === 'link' ? 1 : 0));
  ordered.forEach((mark, i) => {
    out = applyMark(mark, out, `${key}-m${i}`, ctx);
  });
  return <Fragment key={key}>{out}</Fragment>;
}

/* -------------------------------------------------------------------------- */
/*  Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderChildren(node: ContentNode, ctx: RenderContext, keyPrefix: string): ReactNode[] {
  const children = Array.isArray(node.content) ? node.content : [];
  const out: ReactNode[] = [];
  children.forEach((child, i) => {
    const el = renderNode(child, ctx, `${keyPrefix}-${i}`);
    if (el !== null && el !== undefined) out.push(el);
  });
  return out;
}

function Caption({ caption, credit }: { caption: string; credit: string }) {
  if (!caption && !credit) return null;
  return (
    <figcaption>
      {caption ? <span className="caption">{caption}</span> : null}
      {caption && credit ? ' ' : null}
      {credit ? <span className="credit">{credit}</span> : null}
    </figcaption>
  );
}

function renderImage(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const a = attrs(node);
  const mediaId = s(a.mediaId);
  const media = mediaId ? ctx.media.get(mediaId) : undefined;
  const src = safeSrc(a.src) ?? '';
  const alt = s(a.alt) || (media?.alt ?? '');
  const caption = s(a.caption) || (media?.caption ?? '');
  const credit = s(a.credit) || (media?.credit ?? '');
  const size = a.size === 'wide' || a.size === 'full' ? a.size : 'normal';
  if (!media && !src) return null;
  return (
    <figure key={key} className="article-image" data-size={size}>
      {media ? (
        <MediaImage media={media} sizes={ctx.imageSizes ?? DEFAULT_IMAGE_SIZES} aspect="auto" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- external/legacy src without a media row
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      )}
      <Caption caption={caption} credit={credit} />
    </figure>
  );
}

function renderGallery(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const items = attrs(node).items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const figures: ReactNode[] = [];
  items.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Attrs;
    const mediaId = s(item.mediaId);
    const media = mediaId ? ctx.media.get(mediaId) : undefined;
    const src = safeSrc(item.src) ?? '';
    if (!media && !src) return;
    const alt = s(item.alt) || (media?.alt ?? '');
    figures.push(
      <figure key={`${key}-${i}`}>
        {media ? (
          <MediaImage media={media} sizes="(min-width: 1024px) 360px, 50vw" aspect="4/3" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- external/legacy src without a media row
          <img src={src} alt={alt} loading="lazy" decoding="async" />
        )}
        <Caption
          caption={s(item.caption) || (media?.caption ?? '')}
          credit={s(item.credit) || (media?.credit ?? '')}
        />
      </figure>,
    );
  });
  if (!figures.length) return null;
  return (
    <div key={key} className="gallery" role="group" aria-label={t('editor.render.gallery')}>
      {figures}
    </div>
  );
}

function EmbedCard({ url, provider, title }: { url: string; provider: EmbedProvider; title: string }) {
  const label = EMBED_PROVIDER_LABELS[provider];
  return (
    <a className="embed-card" href={url} target="_blank" rel="noopener noreferrer nofollow">
      <span className="embed-card-provider">{label}</span>
      <span className="embed-card-title">{title || t('editor.render.openOn', { provider: label })}</span>
      <span className="embed-card-url">{displayHost(url)}</span>
    </a>
  );
}

function renderEmbed(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const a = attrs(node);
  const url = s(a.url).trim();
  const info = embedInfo(url);
  if (!info) return null;
  const provider: EmbedProvider =
    isEmbedProvider(a.provider) && a.provider === info.provider ? a.provider : info.provider;
  const title = s(a.title);
  const aspect = a.aspect === '4:3' || a.aspect === '1:1' ? a.aspect : info.aspect;
  const full = ctx.embeds !== 'placeholder';

  if (full && info.embedUrl && IFRAME_PROVIDERS.has(provider)) {
    return (
      <figure key={key} className={`embed embed-${provider}`} data-aspect={aspect}>
        <iframe
          src={info.embedUrl}
          title={title || `${EMBED_PROVIDER_LABELS[provider]}: ${displayHost(url)}`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        {title ? <figcaption>{title}</figcaption> : null}
      </figure>
    );
  }
  return (
    <div key={key} className={`embed embed-card-wrap embed-${provider}`}>
      <EmbedCard url={url} provider={provider} title={title} />
    </div>
  );
}

function renderTable(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const rows = Array.isArray(node.content) ? node.content.filter((r) => r.type === 'tableRow') : [];
  if (!rows.length) return null;
  const headerRow =
    rows[0] && Array.isArray(rows[0].content) && rows[0].content.every((c) => c.type === 'tableHeader')
      ? rows[0]
      : null;
  const bodyRows = headerRow ? rows.slice(1) : rows;
  const renderRow = (row: ContentNode, rowKey: string) => (
    <tr key={rowKey}>
      {(row.content ?? []).map((cell, ci) => {
        const ca = attrs(cell);
        const Tag = cell.type === 'tableHeader' ? 'th' : 'td';
        const colSpan = typeof ca.colspan === 'number' && ca.colspan > 1 ? ca.colspan : undefined;
        const rowSpan = typeof ca.rowspan === 'number' && ca.rowspan > 1 ? ca.rowspan : undefined;
        return (
          <Tag
            key={`${rowKey}-${ci}`}
            colSpan={colSpan}
            rowSpan={rowSpan}
            scope={Tag === 'th' ? 'col' : undefined}
          >
            {renderChildren(cell, ctx, `${rowKey}-${ci}`)}
          </Tag>
        );
      })}
    </tr>
  );
  return (
    <div key={key} className="table-wrap">
      <table>
        {headerRow ? <thead>{renderRow(headerRow, `${key}-h`)}</thead> : null}
        <tbody>{bodyRows.map((row, ri) => renderRow(row, `${key}-r${ri}`))}</tbody>
      </table>
    </div>
  );
}

function renderRelated(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const ids = attrs(node).articleIds;
  if (!Array.isArray(ids)) return null;
  const teasers = ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => ctx.articles.get(id))
    .filter((a): a is ArticleTeaser => Boolean(a));
  if (!teasers.length) return null;
  return (
    <aside key={key} className="related" aria-label={t('editor.render.readAlso')}>
      <h3 className="related-title">{t('editor.render.readAlso')}</h3>
      <ul>
        {teasers.map((a) => (
          <li key={a.id}>
            <a href={resolveHref(publicPaths.article(a.sectionSlug, a.sectionSlug ? a.slug : a.id), ctx)}>
              {a.kicker ? <span className="related-kicker">{a.kicker} </span> : null}
              {a.title}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function renderLiveBlog(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  const id = s(attrs(node).liveBlogId);
  if (!id) return null;
  const live = ctx.liveBlogs?.get(id);
  return (
    <aside
      key={key}
      className="live-blog-embed"
      data-live-blog-id={id}
      data-live-status={live?.status ?? undefined}
    >
      {live ? (
        <a href={resolveHref(publicPaths.live(live.slug), ctx)}>
          <span className="live-blog-label">{t('editor.render.liveBlog')}</span>
          <span className="live-blog-title">{live.title}</span>
        </a>
      ) : (
        <span className="live-blog-label">{t('editor.render.liveBlog')}</span>
      )}
    </aside>
  );
}

function renderNode(node: ContentNode, ctx: RenderContext, key: string): ReactNode {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return null;
  const a = attrs(node);
  switch (node.type) {
    case 'text':
      return renderText(node, key, ctx);
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph': {
      const children = renderChildren(node, ctx, key);
      return (
        <p key={key} style={alignStyle(a)}>
          {children.length ? children : null}
        </p>
      );
    }
    case 'heading': {
      const level = a.level === 3 ? 3 : a.level === 4 ? 4 : 2;
      const children = renderChildren(node, ctx, key);
      if (level === 3)
        return (
          <h3 key={key} style={alignStyle(a)}>
            {children}
          </h3>
        );
      if (level === 4)
        return (
          <h4 key={key} style={alignStyle(a)}>
            {children}
          </h4>
        );
      return (
        <h2 key={key} style={alignStyle(a)}>
          {children}
        </h2>
      );
    }
    case 'bulletList':
      return <ul key={key}>{renderChildren(node, ctx, key)}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={typeof a.start === 'number' && a.start !== 1 ? a.start : undefined}>
          {renderChildren(node, ctx, key)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{renderChildren(node, ctx, key)}</li>;
    case 'blockquote':
      return <blockquote key={key}>{renderChildren(node, ctx, key)}</blockquote>;
    case 'pullquote': {
      const cite = s(a.cite);
      return (
        <figure key={key} className="pullquote">
          <blockquote>{renderChildren(node, ctx, key)}</blockquote>
          {cite ? <figcaption>{cite}</figcaption> : null}
        </figure>
      );
    }
    case 'horizontalRule':
      return <hr key={key} />;
    case 'image':
      return renderImage(node, ctx, key);
    case 'gallery':
      return renderGallery(node, ctx, key);
    case 'embed':
      return renderEmbed(node, ctx, key);
    case 'factbox': {
      const title = s(a.title);
      return (
        <aside key={key} className="factbox" aria-label={title || t('editor.render.factbox')}>
          {title ? <h3 className="factbox-title">{title}</h3> : null}
          {renderChildren(node, ctx, key)}
        </aside>
      );
    }
    case 'table':
      return renderTable(node, ctx, key);
    case 'tableRow':
    case 'tableCell':
    case 'tableHeader':
      // Only meaningful inside a table; stray cells render their children.
      return <div key={key}>{renderChildren(node, ctx, key)}</div>;
    case 'relatedArticles':
      return renderRelated(node, ctx, key);
    case 'liveBlog':
      return renderLiveBlog(node, ctx, key);
    default: {
      // Unknown node: render children so no text is lost, never its attrs.
      const children = renderChildren(node, ctx, key);
      return children.length ? <div key={key}>{children}</div> : null;
    }
  }
}

/** Render a document to React nodes. Safe on any input shape. */
export function renderDoc(doc: ContentDoc, ctx: RenderContext): ReactNode {
  const content = doc && Array.isArray(doc.content) ? doc.content : [];
  const out: ReactNode[] = [];
  content.forEach((node, i) => {
    try {
      const el = renderNode(node, ctx, `n${i}`);
      if (el !== null && el !== undefined) out.push(el);
    } catch (err) {
      console.error('[content] render failed for node', node?.type, err);
    }
  });
  return <>{out}</>;
}

/** Convenience for callers with nothing to resolve (e.g. previews of text-only docs). */
export function emptyRenderContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return { media: new Map(), articles: new Map(), ...overrides };
}
