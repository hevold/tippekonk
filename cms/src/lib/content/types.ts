/**
 * Content document model — a validated subset of ProseMirror/TipTap JSON.
 *
 * Articles store their body as a `ContentDoc`. The admin editor (TipTap)
 * produces it, the public site renders it with `renderDoc()` (React), and
 * `docToPlainText()` projects it to text for search and excerpts.
 *
 * Node catalogue (type → attrs):
 *  paragraph        { textAlign?: 'left'|'center'|'right' }
 *  heading          { level: 2|3|4, textAlign? }
 *  bulletList       —
 *  orderedList      { start?: number }
 *  listItem         —
 *  blockquote       —                          (sitat)
 *  pullquote        { cite?: string }          (uthevet sitat; content: paragraph[])
 *  horizontalRule   —
 *  hardBreak        —
 *  image            { mediaId: string, src?: string, alt?: string, caption?: string,
 *                     credit?: string, size?: 'normal'|'wide'|'full', width?: number, height?: number }
 *  gallery          { items: { mediaId: string, src?: string, alt?: string, caption?: string, credit?: string }[] }
 *  embed            { provider: EmbedProvider, url: string, title?: string, aspect?: '16:9'|'4:3'|'1:1' }
 *  factbox          { title?: string }         (faktaboks; content: block nodes)
 *  table / tableRow / tableHeader / tableCell  (TipTap table attrs: colspan, rowspan, colwidth)
 *  relatedArticles  { articleIds: string[] }
 *  liveBlog         { liveBlogId: string }
 *  text             { text, marks?: Mark[] }
 *
 * Marks: bold, italic, underline, strike, subscript, superscript, highlight,
 *        link { href, target?, rel? }, code
 *
 * Renderers MUST ignore unknown node types gracefully (render children or nothing),
 * never throw on malformed input, and never emit raw HTML from the document.
 */

export type EmbedProvider =
  | 'youtube'
  | 'vimeo'
  | 'nrk'
  | 'x'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'spotify'
  | 'soundcloud'
  | 'generic';

export type MarkType =
  'bold' | 'italic' | 'underline' | 'strike' | 'subscript' | 'superscript' | 'highlight' | 'link' | 'code';

export type Mark = {
  type: MarkType;
  attrs?: Record<string, unknown>;
};

export type ContentNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ContentNode[];
  /** Only for `text` nodes. */
  text?: string;
  /** Only for `text` nodes. */
  marks?: Mark[];
};

export type ContentDoc = {
  type: 'doc';
  content: ContentNode[];
};

export const EMPTY_DOC: ContentDoc = { type: 'doc', content: [] };

export const BLOCK_NODE_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'pullquote',
  'horizontalRule',
  'image',
  'gallery',
  'embed',
  'factbox',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'relatedArticles',
  'liveBlog',
] as const;

export const INLINE_NODE_TYPES = ['text', 'hardBreak'] as const;
