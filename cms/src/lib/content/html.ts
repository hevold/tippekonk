/**
 * ContentDoc → static HTML string, for RSS full-content feeds and the JSON
 * API. Deliberately React-free: Next 16 compiles route handlers in the React
 * Server layer where `react-dom/server` resolves to a stub that throws, and
 * feeds and the API are served by route handlers. The markup mirrors
 * `renderDoc()` in ./render.tsx (same elements, class names and rules) so the
 * page, the feed and the API never diverge: text is escaped, only
 * `isSafeHref` links and `safeSrc` images survive, embeds are sandboxed
 * iframes or link cards, unknown nodes render their children, malformed
 * nodes render nothing, and nothing here throws on bad input.
 *
 *   docToHtml(doc, { media, articles })                          // root-relative URLs
 *   docToFeedHtml(doc, { baseUrl, media, articles })             // absolute URLs, embeds as link cards
 */
import { publicPaths } from '@/config/routes';
import type { Media } from '@/db/schema';
import { t } from '@/lib/i18n';
import type { ArticleTeaser, LiveBlogSummary } from '@/lib/layout/engine';
import { mediaSrcSet, mediaUrl } from '@/server/media/urls';
import { absoluteUrl } from '@/server/public/paths';

import { displayHost, EMBED_PROVIDER_LABELS, embedInfo, isEmbedProvider } from './embed';
import type { RenderContext } from './render';
import { isSafeHref, safeSrc } from './schema';
import type { ContentDoc, ContentNode, EmbedProvider, Mark } from './types';

export type FeedHtmlContext = {
  /** Absolute origin of the site, e.g. "https://elvebyen.no"; every URL in the output is resolved against it. */
  baseUrl: string;
  media: Map<string, Media>;
  articles: Map<string, ArticleTeaser>;
  liveBlogs?: Map<string, LiveBlogSummary>;
  /** Target width for the fallback `src` rendition (default 1280). */
  imageWidth?: number;
};

type Attrs = Record<string, unknown>;

const IFRAME_PROVIDERS: ReadonlySet<EmbedProvider> = new Set<EmbedProvider>(['youtube', 'vimeo', 'nrk']);
const DEFAULT_IMAGE_SIZES = '(min-width: 1024px) 720px, 100vw';
const DEFAULT_IMAGE_WIDTH = 1280;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrs(node: ContentNode): Attrs {
  return node.attrs && typeof node.attrs === 'object' ? node.attrs : {};
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function attr(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return ` ${name}="${escapeHtml(value)}"`;
}

function alignStyle(a: Attrs): string {
  const align = a.textAlign;
  return align === 'center' || align === 'right' ? attr('style', `text-align:${align}`) : '';
}

function resolveHref(href: string, ctx: RenderContext): string {
  return ctx.linkResolver ? ctx.linkResolver(href) : href;
}

/* -------------------------------------------------------------------------- */
/*  Inline                                                                     */
/* -------------------------------------------------------------------------- */

function applyMark(mark: Mark, inner: string, ctx: RenderContext): string {
  const a = mark.attrs ?? {};
  switch (mark.type) {
    case 'bold':
      return `<strong>${inner}</strong>`;
    case 'italic':
      return `<em>${inner}</em>`;
    case 'underline':
      return `<u>${inner}</u>`;
    case 'strike':
      return `<s>${inner}</s>`;
    case 'subscript':
      return `<sub>${inner}</sub>`;
    case 'superscript':
      return `<sup>${inner}</sup>`;
    case 'highlight':
      return `<mark>${inner}</mark>`;
    case 'code':
      return `<code>${inner}</code>`;
    case 'link': {
      if (!isSafeHref(a.href)) return inner;
      const blank = a.target === '_blank';
      return (
        `<a${attr('href', resolveHref(a.href.trim(), ctx))}` +
        (blank ? ' target="_blank" rel="noopener noreferrer"' : '') +
        attr('title', s(a.title)) +
        `>${inner}</a>`
      );
    }
    default:
      return inner;
  }
}

function renderText(node: ContentNode, ctx: RenderContext): string {
  const text = node.text ?? '';
  if (!text) return '';
  let out = escapeHtml(text);
  const marks = Array.isArray(node.marks) ? node.marks : [];
  // Apply marks inside-out so the link (if any) becomes the outermost element, as in renderDoc().
  const ordered = [...marks].sort((x, y) => (x.type === 'link' ? 1 : 0) - (y.type === 'link' ? 1 : 0));
  for (const mark of ordered) out = applyMark(mark, out, ctx);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderChildren(node: ContentNode, ctx: RenderContext): string {
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => renderNode(child, ctx)).join('');
}

function caption(text: string, credit: string): string {
  if (!text && !credit) return '';
  return (
    '<figcaption>' +
    (text ? `<span class="caption">${escapeHtml(text)}</span>` : '') +
    (text && credit ? ' ' : '') +
    (credit ? `<span class="credit">${escapeHtml(credit)}</span>` : '') +
    '</figcaption>'
  );
}

function mediaImageTag(media: Media, alt: string, sizes: string, ctx: RenderContext): string {
  const src = resolveHref(mediaUrl(media, ctx.imageWidth ?? DEFAULT_IMAGE_WIDTH), ctx);
  const srcset = mediaSrcSet(media)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/);
      return `${resolveHref(url ?? '', ctx)}${descriptor ? ` ${descriptor}` : ''}`;
    })
    .join(', ');
  const dims = media.width && media.height ? attr('width', media.width) + attr('height', media.height) : '';
  return (
    `<img${attr('src', src)}${attr('srcset', srcset)}${srcset ? attr('sizes', sizes) : ''}` +
    `${attr('alt', alt)}${dims} loading="lazy" decoding="async"/>`
  );
}

/** <img> for a media row (image kind) or a safe external/legacy src; '' when there is nothing to show. */
function imageFor(
  media: Media | undefined,
  rawSrc: string,
  alt: string,
  sizes: string,
  ctx: RenderContext,
): string {
  if (media && media.kind === 'image') return mediaImageTag(media, alt, sizes, ctx);
  const src = safeSrc(rawSrc);
  if (!src) return '';
  return `<img${attr('src', resolveHref(src, ctx))}${attr('alt', alt)} loading="lazy" decoding="async"/>`;
}

function renderImage(node: ContentNode, ctx: RenderContext): string {
  const a = attrs(node);
  const mediaId = s(a.mediaId);
  const media = mediaId ? ctx.media.get(mediaId) : undefined;
  const alt = s(a.alt) || (media?.alt ?? '');
  const size = a.size === 'wide' || a.size === 'full' ? a.size : 'normal';
  const img = imageFor(media, s(a.src), alt, ctx.imageSizes ?? DEFAULT_IMAGE_SIZES, ctx);
  if (!img) return '';
  return (
    `<figure class="article-image" data-size="${size}">${img}` +
    `${caption(s(a.caption) || (media?.caption ?? ''), s(a.credit) || (media?.credit ?? ''))}</figure>`
  );
}

function renderGallery(node: ContentNode, ctx: RenderContext): string {
  const items = attrs(node).items;
  if (!Array.isArray(items) || !items.length) return '';
  const figures: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Attrs;
    const media = s(item.mediaId) ? ctx.media.get(s(item.mediaId)) : undefined;
    const alt = s(item.alt) || (media?.alt ?? '');
    const img = imageFor(media, s(item.src), alt, '(min-width: 1024px) 360px, 50vw', ctx);
    if (!img) continue;
    figures.push(
      `<figure>${img}${caption(s(item.caption) || (media?.caption ?? ''), s(item.credit) || (media?.credit ?? ''))}</figure>`,
    );
  }
  if (!figures.length) return '';
  return `<div class="gallery" role="group"${attr('aria-label', t('editor.render.gallery'))}>${figures.join('')}</div>`;
}

function renderEmbed(node: ContentNode, ctx: RenderContext): string {
  const a = attrs(node);
  const url = s(a.url).trim();
  const info = embedInfo(url);
  if (!info) return '';
  const provider: EmbedProvider =
    isEmbedProvider(a.provider) && a.provider === info.provider ? a.provider : info.provider;
  const label = EMBED_PROVIDER_LABELS[provider];
  const title = s(a.title);
  const aspect = a.aspect === '4:3' || a.aspect === '1:1' ? a.aspect : info.aspect;
  const full = ctx.embeds !== 'placeholder';

  if (full && info.embedUrl && IFRAME_PROVIDERS.has(provider)) {
    return (
      `<figure class="embed embed-${provider}" data-aspect="${aspect}">` +
      `<iframe${attr('src', info.embedUrl)}${attr('title', title || `${label}: ${displayHost(url)}`)}` +
      ' loading="lazy"' +
      ' sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"' +
      ' allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"' +
      ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe>' +
      (title ? `<figcaption>${escapeHtml(title)}</figcaption>` : '') +
      '</figure>'
    );
  }
  return (
    `<div class="embed embed-card-wrap embed-${provider}">` +
    `<a class="embed-card"${attr('href', url)} target="_blank" rel="noopener noreferrer nofollow">` +
    `<span class="embed-card-provider">${escapeHtml(label)}</span>` +
    `<span class="embed-card-title">${escapeHtml(title || t('editor.render.openOn', { provider: label }))}</span>` +
    `<span class="embed-card-url">${escapeHtml(displayHost(url))}</span>` +
    '</a></div>'
  );
}

function renderTable(node: ContentNode, ctx: RenderContext): string {
  const rows = Array.isArray(node.content) ? node.content.filter((r) => r.type === 'tableRow') : [];
  if (!rows.length) return '';
  const first = rows[0]!;
  const headerRow =
    Array.isArray(first.content) && first.content.every((c) => c.type === 'tableHeader') ? first : null;
  const body = headerRow ? rows.slice(1) : rows;
  const row = (r: ContentNode) =>
    `<tr>${(r.content ?? [])
      .map((cell) => {
        const ca = attrs(cell);
        const tag = cell.type === 'tableHeader' ? 'th' : 'td';
        const span =
          (typeof ca.colspan === 'number' && ca.colspan > 1 ? attr('colspan', ca.colspan) : '') +
          (typeof ca.rowspan === 'number' && ca.rowspan > 1 ? attr('rowspan', ca.rowspan) : '');
        return `<${tag}${span}${tag === 'th' ? ' scope="col"' : ''}>${renderChildren(cell, ctx)}</${tag}>`;
      })
      .join('')}</tr>`;
  return (
    '<div class="table-wrap"><table>' +
    (headerRow ? `<thead>${row(headerRow)}</thead>` : '') +
    `<tbody>${body.map(row).join('')}</tbody></table></div>`
  );
}

function renderRelated(node: ContentNode, ctx: RenderContext): string {
  const ids = attrs(node).articleIds;
  if (!Array.isArray(ids)) return '';
  const teasers = ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => ctx.articles.get(id))
    .filter((a): a is ArticleTeaser => Boolean(a));
  if (!teasers.length) return '';
  const label = t('editor.render.readAlso');
  const items = teasers
    .map((a) => {
      const href = resolveHref(publicPaths.article(a.sectionSlug, a.sectionSlug ? a.slug : a.id), ctx);
      return `<li><a${attr('href', href)}>${
        a.kicker ? `<span class="related-kicker">${escapeHtml(a.kicker)} </span>` : ''
      }${escapeHtml(a.title)}</a></li>`;
    })
    .join('');
  return `<aside class="related"${attr('aria-label', label)}><h3 class="related-title">${escapeHtml(label)}</h3><ul>${items}</ul></aside>`;
}

function renderLiveBlog(node: ContentNode, ctx: RenderContext): string {
  const id = s(attrs(node).liveBlogId);
  if (!id) return '';
  const live = ctx.liveBlogs?.get(id);
  const label = `<span class="live-blog-label">${escapeHtml(t('editor.render.liveBlog'))}</span>`;
  return (
    `<aside class="live-blog-embed"${attr('data-live-blog-id', id)}${attr('data-live-status', live?.status)}>` +
    (live
      ? `<a${attr('href', resolveHref(publicPaths.live(live.slug), ctx))}>${label}<span class="live-blog-title">${escapeHtml(live.title)}</span></a>`
      : label) +
    '</aside>'
  );
}

function renderNode(node: ContentNode, ctx: RenderContext): string {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return '';
  const a = attrs(node);
  switch (node.type) {
    case 'text':
      return renderText(node, ctx);
    case 'hardBreak':
      return '<br/>';
    case 'paragraph':
      return `<p${alignStyle(a)}>${renderChildren(node, ctx)}</p>`;
    case 'heading': {
      const level = a.level === 3 ? 3 : a.level === 4 ? 4 : 2;
      return `<h${level}${alignStyle(a)}>${renderChildren(node, ctx)}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${renderChildren(node, ctx)}</ul>`;
    case 'orderedList':
      return `<ol${typeof a.start === 'number' && a.start !== 1 ? attr('start', a.start) : ''}>${renderChildren(node, ctx)}</ol>`;
    case 'listItem':
      return `<li>${renderChildren(node, ctx)}</li>`;
    case 'blockquote':
      return `<blockquote>${renderChildren(node, ctx)}</blockquote>`;
    case 'pullquote': {
      const cite = s(a.cite);
      return `<figure class="pullquote"><blockquote>${renderChildren(node, ctx)}</blockquote>${
        cite ? `<figcaption>${escapeHtml(cite)}</figcaption>` : ''
      }</figure>`;
    }
    case 'horizontalRule':
      return '<hr/>';
    case 'image':
      return renderImage(node, ctx);
    case 'gallery':
      return renderGallery(node, ctx);
    case 'embed':
      return renderEmbed(node, ctx);
    case 'factbox': {
      const title = s(a.title);
      return (
        `<aside class="factbox"${attr('aria-label', title || t('editor.render.factbox'))}>` +
        `${title ? `<h3 class="factbox-title">${escapeHtml(title)}</h3>` : ''}${renderChildren(node, ctx)}</aside>`
      );
    }
    case 'table':
      return renderTable(node, ctx);
    case 'tableRow':
    case 'tableCell':
    case 'tableHeader':
      // Only meaningful inside a table; stray cells render their children.
      return `<div>${renderChildren(node, ctx)}</div>`;
    case 'relatedArticles':
      return renderRelated(node, ctx);
    case 'liveBlog':
      return renderLiveBlog(node, ctx);
    default: {
      // Unknown node: render children so no text is lost, never its attrs.
      const children = renderChildren(node, ctx);
      return children ? `<div>${children}</div>` : '';
    }
  }
}

/** Serialise a document to HTML with the same markup as `renderDoc()`. Safe on any input shape; never throws. */
export function docToHtml(doc: ContentDoc, ctx: RenderContext): string {
  const content = doc && Array.isArray(doc.content) ? doc.content : [];
  const out: string[] = [];
  for (const node of content) {
    try {
      const html = renderNode(node, ctx);
      if (html) out.push(html);
    } catch (err) {
      console.error('[content] html failed for node', node?.type, err);
    }
  }
  return out.join('');
}

/**
 * HTML for feeds and the API: every URL absolute (feed readers have no base
 * URL) and embeds as link cards (no third-party iframes in syndicated content).
 */
export function docToFeedHtml(doc: ContentDoc, ctx: FeedHtmlContext): string {
  const { baseUrl, imageWidth, ...rest } = ctx;
  return docToHtml(doc, {
    ...rest,
    imageWidth,
    embeds: 'placeholder',
    linkResolver: (href) => absoluteUrl(baseUrl, href),
  });
}
