/**
 * Small builders for ContentDoc nodes used by the seed, plus the plain-text
 * projection needed to fill `bodyText`, `wordCount` and `readingTimeMin`.
 * Deliberately self-contained so the seed does not depend on the content
 * area's helpers (src/lib/content/text.ts).
 */
import type { ContentDoc, ContentNode, Mark } from '@/lib/content/types';

export type Inline = string | ContentNode;

function inline(parts: Inline | Inline[]): ContentNode[] {
  const list = Array.isArray(parts) ? parts : [parts];
  return list.map((part) => (typeof part === 'string' ? { type: 'text', text: part } : part));
}

function marked(text: string, marks: Mark[]): ContentNode {
  return { type: 'text', text, marks };
}

export const bold = (text: string): ContentNode => marked(text, [{ type: 'bold' }]);
export const italic = (text: string): ContentNode => marked(text, [{ type: 'italic' }]);
export const link = (text: string, href: string): ContentNode =>
  marked(text, [{ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer' } }]);

export const p = (parts: Inline | Inline[]): ContentNode => ({ type: 'paragraph', content: inline(parts) });

export const h2 = (text: string): ContentNode => ({
  type: 'heading',
  attrs: { level: 2 },
  content: inline(text),
});

export const h3 = (text: string): ContentNode => ({
  type: 'heading',
  attrs: { level: 3 },
  content: inline(text),
});

export const ul = (items: (Inline | Inline[])[]): ContentNode => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
});

export const ol = (items: (Inline | Inline[])[]): ContentNode => ({
  type: 'orderedList',
  attrs: { start: 1 },
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
});

export const blockquote = (...paragraphs: (Inline | Inline[])[]): ContentNode => ({
  type: 'blockquote',
  content: paragraphs.map((x) => p(x)),
});

export const pullquote = (text: string, cite?: string): ContentNode => ({
  type: 'pullquote',
  attrs: cite ? { cite } : {},
  content: [p(text)],
});

export const factbox = (title: string, ...content: ContentNode[]): ContentNode => ({
  type: 'factbox',
  attrs: { title },
  content,
});

export const hr = (): ContentNode => ({ type: 'horizontalRule' });

export type ImageRef = {
  id: string;
  alt: string;
  caption: string;
  credit: string;
  width: number;
  height: number;
};

export const image = (
  ref: ImageRef,
  opts: { caption?: string; size?: 'normal' | 'wide' | 'full' } = {},
): ContentNode => ({
  type: 'image',
  attrs: {
    mediaId: ref.id,
    alt: ref.alt,
    caption: opts.caption ?? ref.caption,
    credit: ref.credit,
    size: opts.size ?? 'normal',
    width: ref.width,
    height: ref.height,
  },
});

export const youtube = (url: string, title: string): ContentNode => ({
  type: 'embed',
  attrs: { provider: 'youtube', url, title, aspect: '16:9' },
});

export const related = (articleIds: string[]): ContentNode => ({
  type: 'relatedArticles',
  attrs: { articleIds },
});

export const liveBlogNode = (liveBlogId: string): ContentNode => ({
  type: 'liveBlog',
  attrs: { liveBlogId },
});

export const doc = (...content: ContentNode[]): ContentDoc => ({ type: 'doc', content });

/* -------------------------------------------------------------------------- */
/*  Text projection                                                            */
/* -------------------------------------------------------------------------- */

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'pullquote',
  'factbox',
  'tableRow',
  'image',
  'gallery',
  'embed',
]);

function collect(node: ContentNode, out: string[]): void {
  if (node.type === 'text') {
    if (node.text) out.push(node.text);
    return;
  }
  if (node.type === 'hardBreak') {
    out.push('\n');
    return;
  }
  if (node.type === 'image' && typeof node.attrs?.caption === 'string' && node.attrs.caption) {
    out.push(node.attrs.caption, '\n');
  }
  if (node.type === 'factbox' && typeof node.attrs?.title === 'string' && node.attrs.title) {
    out.push(node.attrs.title, '\n');
  }
  for (const child of node.content ?? []) collect(child, out);
  if (BLOCK_TYPES.has(node.type)) out.push('\n');
}

/** Plain-text projection of a document: block nodes separated by newlines. */
export function docToPlainText(document: ContentDoc): string {
  const out: string[] = [];
  for (const node of document.content) collect(node, out);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function wordCount(text: string): number {
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length;
}

/** ceil(words / 200), minimum 1. */
export function readingTimeMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

export function textStats(document: ContentDoc): {
  bodyText: string;
  wordCount: number;
  readingTimeMin: number;
} {
  const bodyText = docToPlainText(document);
  const words = wordCount(bodyText);
  return { bodyText, wordCount: words, readingTimeMin: readingTimeMinutes(words) };
}
