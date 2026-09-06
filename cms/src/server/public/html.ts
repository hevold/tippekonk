/**
 * ContentDoc → HTML string for RSS full-content feeds, without React.
 *
 * Why not `docToHtml()` from '@/lib/content/html': that helper renders with
 * `react-dom/server`, and Next 16 compiles route handlers in the React
 * Server layer where every `react-dom/server*` entry resolves to a stub that
 * throws ("react-dom/server is not supported in React Server Components") —
 * the build refuses the import outright. Feeds are served by route handlers,
 * so this module serialises the document directly. It mirrors the markup of
 * `renderDoc()` (same elements and class names) and follows the same rules:
 * text is escaped, only `isSafeHref` links survive, embeds become link cards,
 * unknown nodes render their children, malformed nodes render nothing, and
 * every URL is absolute because feed readers have no base URL.
 *
 *   const html = docToFeedHtml(article.body, { baseUrl, media, articles });
 */
import type { Media } from '@/db/schema';
import { displayHost, EMBED_PROVIDER_LABELS, embedInfo, isEmbedProvider } from '@/lib/content/embed';
import { isSafeHref } from '@/lib/content/schema';
import type { ContentDoc, ContentNode, EmbedProvider, Mark } from '@/lib/content/types';
import type { ArticleTeaser, LiveBlogSummary } from '@/lib/layout/engine';
import { mediaUrl } from '@/server/media/urls';

import { absoluteUrl } from './paths';

export type FeedHtmlContext = {
  /** Absolute origin of the site, e.g. "https://elvebyen.no". */
  baseUrl: string;
  /** Media referenced by image/gallery nodes, keyed by id. */
  media: Map<string, Media>;
  /** Teasers referenced by relatedArticles nodes, keyed by id. */
  articles: Map<string, ArticleTeaser>;
  /** Live blogs referenced by liveBlog nodes, keyed by id. */
  liveBlogs?: Map<string, LiveBlogSummary>;
  /** Target width for image renditions (default 1280). */
  imageWidth?: number;
};

type Attrs = Record<string, unknown>;

const IMAGE_WIDTH = 1280;

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

function href(ctx: FeedHtmlContext, path: string): string {
  return absoluteUrl(ctx.baseUrl, path);
}

/* -------------------------------------------------------------------------- */
/*  Inline                                                                     */
/* -------------------------------------------------------------------------- */

function applyMark(mark: Mark, inner: string, ctx: FeedHtmlContext): string {
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
        `<a${attr('href', href(ctx, a.href.trim()))}` +
        (blank ? ' target="_blank" rel="noopener noreferrer"' : '') +
        attr('title', s(a.title)) +
        `>${inner}</a>`
      );
    }
    default:
      return inner;
  }
}

function renderText(node: ContentNode, ctx: FeedHtmlContext): string {
  const text = node.text ?? '';
  if (!text) return '';
  let out = escapeHtml(text);
  const marks = Array.isArray(node.marks) ? node.marks : [];
  // Link becomes the outermost element, as in renderDoc().
  const ordered = [...marks].sort((x, y) => (x.type === 'link' ? 1 : 0) - (y.type === 'link' ? 1 : 0));
  for (const mark of ordered) out = applyMark(mark, out, ctx);
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderChildren(node: ContentNode, ctx: FeedHtmlContext): string {
  const children = Array.isArray(node.content) ? node.content : [];
  return children.map((child) => renderNode(child, ctx)).join('');
}

function caption(text: string, credit: string): string {
  if (!text && !credit) return '';
  const parts = [
    text ? `<span class="caption">${escapeHtml(text)}</span>` : '',
    text && credit ? ' ' : '',
    credit ? `<span class="credit">${escapeHtml(credit)}</span>` : '',
  ];
  return `<figcaption>${parts.join('')}</figcaption>`;
}

function imageTag(ctx: FeedHtmlContext, media: Media, alt: string): string {
  const dims = media.width && media.height ? attr('width', media.width) + attr('height', media.height) : '';
  return `<img${attr('src', href(ctx, mediaUrl(media, ctx.imageWidth ?? IMAGE_WIDTH)))}${attr('alt', alt)}${dims}/>`;
}

function renderImage(node: ContentNode, ctx: FeedHtmlContext): string {
  const a = attrs(node);
  const mediaId = s(a.mediaId);
  const media = mediaId ? ctx.media.get(mediaId) : undefined;
  const src = s(a.src).trim();
  const alt = s(a.alt) || (media?.alt ?? '');
  const size = a.size === 'wide' || a.size === 'full' ? a.size : 'normal';
  let img: string;
  if (media && media.kind === 'image') img = imageTag(ctx, media, alt);
  else if (src && isSafeHref(src) && !/^(mailto|tel):/i.test(src))
    img = `<img${attr('src', href(ctx, src))}${attr('alt', alt)}/>`;
  else return '';
  return `<figure class="article-image" data-size="${size}">${img}${caption(
    s(a.caption) || (media?.caption ?? ''),
    s(a.credit) || (media?.credit ?? ''),
  )}</figure>`;
}

function renderGallery(node: ContentNode, ctx: FeedHtmlContext): string {
  const items = attrs(node).items;
  if (!Array.isArray(items) || !items.length) return '';
  const figures: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Attrs;
    const media = s(item.mediaId) ? ctx.media.get(s(item.mediaId)) : undefined;
    const src = s(item.src).trim();
    const alt = s(item.alt) || (media?.alt ?? '');
    let img: string;
    if (media && media.kind === 'image') img = imageTag(ctx, media, alt);
    else if (src && isSafeHref(src) && !/^(mailto|tel):/i.test(src))
      img = `<img${attr('src', href(ctx, src))}${attr('alt', alt)}/>`;
    else continue;
    figures.push(
      `<figure>${img}${caption(s(item.caption) || (media?.caption ?? ''), s(item.credit) || (media?.credit ?? ''))}</figure>`,
    );
  }
  return figures.length ? `<div class="gallery">${figures.join('')}</div>` : '';
}

function renderEmbed(node: ContentNode): string {
  const a = attrs(node);
  const url = s(a.url).trim();
  const info = embedInfo(url);
  if (!info) return '';
  const provider: EmbedProvider =
    isEmbedProvider(a.provider) && a.provider === info.provider ? a.provider : info.provider;
  const label = EMBED_PROVIDER_LABELS[provider];
  const title = s(a.title) || displayHost(url);
  return (
    `<p class="embed embed-${provider}"><a${attr('href', url)} rel="noopener noreferrer nofollow">` +
    `${escapeHtml(label)}: ${escapeHtml(title)}</a></p>`
  );
}

function renderTable(node: ContentNode, ctx: FeedHtmlContext): string {
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
    `<table>` +
    (headerRow ? `<thead>${row(headerRow)}</thead>` : '') +
    `<tbody>${body.map(row).join('')}</tbody></table>`
  );
}

function teaserPath(a: ArticleTeaser): string {
  return a.sectionSlug ? `/${a.sectionSlug}/${a.slug}` : `/a/${a.id}`;
}

function renderRelated(node: ContentNode, ctx: FeedHtmlContext): string {
  const ids = attrs(node).articleIds;
  if (!Array.isArray(ids)) return '';
  const teasers = ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => ctx.articles.get(id))
    .filter((a): a is ArticleTeaser => Boolean(a));
  if (!teasers.length) return '';
  const items = teasers
    .map(
      (a) =>
        `<li><a${attr('href', href(ctx, teaserPath(a)))}>${
          a.kicker ? `<span class="related-kicker">${escapeHtml(a.kicker)} </span>` : ''
        }${escapeHtml(a.title)}</a></li>`,
    )
    .join('');
  return `<aside class="related"><h3 class="related-title">Les også</h3><ul>${items}</ul></aside>`;
}

function renderLiveBlog(node: ContentNode, ctx: FeedHtmlContext): string {
  const id = s(attrs(node).liveBlogId);
  const live = id ? ctx.liveBlogs?.get(id) : undefined;
  if (!live) return '';
  return `<p class="live-blog-embed"><a${attr('href', href(ctx, `/direkte/${live.slug}`))}>Direkte: ${escapeHtml(live.title)}</a></p>`;
}

function renderNode(node: ContentNode, ctx: FeedHtmlContext): string {
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
      return renderEmbed(node);
    case 'factbox': {
      const title = s(a.title);
      return `<aside class="factbox">${title ? `<h3 class="factbox-title">${escapeHtml(title)}</h3>` : ''}${renderChildren(node, ctx)}</aside>`;
    }
    case 'table':
      return renderTable(node, ctx);
    case 'tableRow':
    case 'tableCell':
    case 'tableHeader':
      return `<div>${renderChildren(node, ctx)}</div>`;
    case 'relatedArticles':
      return renderRelated(node, ctx);
    case 'liveBlog':
      return renderLiveBlog(node, ctx);
    default: {
      const children = renderChildren(node, ctx);
      return children ? `<div>${children}</div>` : '';
    }
  }
}

/** Serialise a document to HTML for feeds. Safe on any input shape; never throws. */
export function docToFeedHtml(doc: ContentDoc, ctx: FeedHtmlContext): string {
  const content = doc && Array.isArray(doc.content) ? doc.content : [];
  const out: string[] = [];
  for (const node of content) {
    try {
      const html = renderNode(node, ctx);
      if (html) out.push(html);
    } catch (err) {
      console.error('[public] feed html failed for node', node?.type, err);
    }
  }
  return out.join('');
}
