/**
 * Text projections of a ContentDoc: plain text for search and excerpts, word
 * count and reading time, and id extraction (media, related articles, live
 * blogs) so the article service can validate references and preload data
 * for rendering.
 */
import { countWords, excerpt as textExcerpt, normalizeWhitespace } from '@/lib/text';

import type { ContentDoc, ContentNode } from './types';

const WORDS_PER_MINUTE = 200;

/** Node types whose text starts on its own line when projected. */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'pullquote',
  'factbox',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'gallery',
  'image',
  'embed',
]);

type Visitor = (node: ContentNode, depth: number) => void;

/** Depth-first walk over every node, including nested content. */
export function walkDoc(doc: ContentDoc | ContentNode, visit: Visitor): void {
  const stack: { node: ContentNode; depth: number }[] = [];
  const roots = (doc as { content?: ContentNode[] }).content ?? [];
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ node: roots[i]!, depth: 1 });
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node !== 'object') continue;
    visit(node, depth);
    const children = node.content;
    if (Array.isArray(children)) {
      for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, depth: depth + 1 });
    }
  }
}

function attrString(node: ContentNode, key: string): string {
  const v = node.attrs?.[key];
  return typeof v === 'string' ? v : '';
}

function nodeToText(node: ContentNode, out: string[]): void {
  if (node.type === 'text') {
    out.push(node.text ?? '');
    return;
  }
  if (node.type === 'hardBreak') {
    out.push('\n');
    return;
  }
  const isBlock = BLOCK_TYPES.has(node.type) || !node.content;
  if (isBlock && out.length && !out[out.length - 1]!.endsWith('\n')) out.push('\n');

  if (node.type === 'factbox') {
    const title = attrString(node, 'title');
    if (title) out.push(title, '\n');
  }
  if (node.type === 'image') {
    const caption = attrString(node, 'caption');
    if (caption) out.push(caption, '\n');
  }
  if (node.type === 'gallery') {
    const items = node.attrs?.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const caption =
          item && typeof item === 'object' ? (item as { caption?: unknown }).caption : undefined;
        if (typeof caption === 'string' && caption.trim()) out.push(caption, '\n');
      }
    }
  }
  if (node.type === 'embed') {
    const title = attrString(node, 'title');
    if (title) out.push(title, '\n');
  }
  if (node.type === 'pullquote') {
    const cite = attrString(node, 'cite');
    if (Array.isArray(node.content)) for (const c of node.content) nodeToText(c, out);
    if (cite) out.push('\n', cite, '\n');
    return;
  }

  if (Array.isArray(node.content)) {
    for (const c of node.content) nodeToText(c, out);
  }
  if (isBlock) out.push('\n');
}

/** Plain text with one line per block; captions and factbox titles are included (useful for search). */
export function docToPlainText(doc: ContentDoc): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  const out: string[] = [];
  for (const node of doc.content) nodeToText(node, out);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Word count of the body text. */
export function docWordCount(doc: ContentDoc): number {
  return countWords(docToPlainText(doc));
}

/** Reading time at 200 words per minute, never below 1. */
export function readingTimeMinutes(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

/** Text of the first paragraphs, cut at a word boundary (for meta descriptions and teasers). */
export function docExcerpt(doc: ContentDoc, maxChars: number = 160): string {
  if (!doc || !Array.isArray(doc.content)) return '';
  const parts: string[] = [];
  let length = 0;
  for (const node of doc.content) {
    if (node.type !== 'paragraph') continue;
    const out: string[] = [];
    nodeToText(node, out);
    const text = normalizeWhitespace(out.join(''));
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
    if (length >= maxChars) break;
  }
  return textExcerpt(parts.join(' '), maxChars);
}

/** Media ids referenced by image nodes and gallery items, in document order, de-duplicated. */
export function docMediaIds(doc: ContentDoc): string[] {
  const ids = new Set<string>();
  walkDoc(doc, (node) => {
    if (node.type === 'image') {
      const id = attrString(node, 'mediaId');
      if (id) ids.add(id);
    } else if (node.type === 'gallery') {
      const items = node.attrs?.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          const id = item && typeof item === 'object' ? (item as { mediaId?: unknown }).mediaId : undefined;
          if (typeof id === 'string' && id) ids.add(id);
        }
      }
    }
  });
  return [...ids];
}

/** Article ids referenced by relatedArticles nodes. */
export function docArticleIds(doc: ContentDoc): string[] {
  const ids = new Set<string>();
  walkDoc(doc, (node) => {
    if (node.type !== 'relatedArticles') return;
    const list = node.attrs?.articleIds;
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string' && id) ids.add(id);
  });
  return [...ids];
}

/** Live blog ids referenced by liveBlog nodes. */
export function docLiveBlogIds(doc: ContentDoc): string[] {
  const ids = new Set<string>();
  walkDoc(doc, (node) => {
    if (node.type !== 'liveBlog') return;
    const id = attrString(node, 'liveBlogId');
    if (id) ids.add(id);
  });
  return [...ids];
}

/**
 * The document cut after its first `count` top-level paragraphs (paywall
 * teaser). Blocks before the cut that are not paragraphs (headings, images)
 * are kept; everything after the Nth paragraph is dropped.
 */
export function docFirstParagraphs(doc: ContentDoc, count: number): ContentDoc {
  if (!doc || !Array.isArray(doc.content)) return { type: 'doc', content: [] };
  if (count <= 0) return { type: 'doc', content: [] };
  const content: ContentNode[] = [];
  let seen = 0;
  for (const node of doc.content) {
    content.push(node);
    if (node.type === 'paragraph') {
      seen += 1;
      if (seen >= count) break;
    }
  }
  return { type: 'doc', content };
}

/** Number of top-level paragraph nodes (to decide whether a paywall teaser hides anything). */
export function docParagraphCount(doc: ContentDoc): number {
  if (!doc || !Array.isArray(doc.content)) return 0;
  return doc.content.filter((n) => n.type === 'paragraph').length;
}
