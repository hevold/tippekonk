/**
 * ContentDoc validation and sanitisation.
 *
 * Documents come from the TipTap editor (trusted-ish), from the public API
 * and from imports (untrusted). The schema is deliberately permissive about
 * structure — unknown node types are kept so nothing is lost — but strict
 * about what could hurt: bounded depth and size, only known attributes on
 * known nodes, and link hrefs limited to http(s), mailto, tel and relative
 * URLs. `sanitizeDoc()` never throws and is safe to call on any JSON.
 */
import { z } from 'zod';

import { embedInfo, isEmbedProvider } from './embed';
import { EMPTY_DOC, type ContentDoc, type ContentNode, type Mark, type MarkType } from './types';

export const MAX_DEPTH = 20;
export const MAX_NODES = 5000;
const MAX_TEXT_LENGTH = 100_000;
const MAX_ATTR_LENGTH = 2000;
const MAX_LIST_LENGTH = 100;

const TEXT_ALIGNS = new Set(['left', 'center', 'right']);
const IMAGE_SIZES = new Set(['normal', 'wide', 'full']);
const ASPECTS = new Set(['16:9', '4:3', '1:1']);
const MARK_TYPES: ReadonlySet<string> = new Set<MarkType>([
  'bold',
  'italic',
  'underline',
  'strike',
  'subscript',
  'superscript',
  'highlight',
  'link',
  'code',
]);

type Attrs = Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max = MAX_ATTR_LENGTH): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.length > max ? v.slice(0, max) : v;
  return s;
}

function nonEmpty(v: unknown, max = MAX_ATTR_LENGTH): string | undefined {
  const s = str(v, max);
  return s && s.trim() ? s : undefined;
}

function int(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function oneOf(v: unknown, allowed: Set<string>): string | undefined {
  return typeof v === 'string' && allowed.has(v) ? v : undefined;
}

/**
 * Link hrefs allowed in content: http(s), mailto, tel, or relative
 * (no scheme). Anything else — javascript:, data:, vbscript:, file: — is dropped.
 */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (!value || value.length > MAX_ATTR_LENGTH) return false;
  // Control characters can smuggle a scheme past naive checks ("java\tscript:").
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) return !value.startsWith('//') || /^\/\/[a-z0-9.-]+/i.test(value);
  const s = scheme[1]!.toLowerCase();
  return s === 'http' || s === 'https' || s === 'mailto' || s === 'tel';
}

/** Image/embed sources: http(s) or root-relative only (no data: URLs in documents). */
function safeSrc(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const value = v.trim();
  if (!value || value.length > MAX_ATTR_LENGTH) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const u = new URL(value);
    if (u.protocol === 'http:' || u.protocol === 'https:') return value;
  } catch {
    /* not absolute */
  }
  return undefined;
}

function compact<T extends Attrs>(attrs: T): Attrs | undefined {
  const out: Attrs = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeMarks(input: unknown): Mark[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: Mark[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!isObject(raw) || typeof raw.type !== 'string' || !MARK_TYPES.has(raw.type)) continue;
    const type = raw.type as MarkType;
    if (seen.has(type)) continue;
    const attrs = isObject(raw.attrs) ? raw.attrs : {};
    if (type === 'link') {
      if (!isSafeHref(attrs.href)) continue;
      const href = attrs.href.trim();
      const target = attrs.target === '_blank' ? '_blank' : undefined;
      const rel = target ? 'noopener noreferrer' : undefined;
      const title = nonEmpty(attrs.title, 300);
      out.push({ type, attrs: compact({ href, target, rel, title }) ?? { href } });
    } else {
      out.push({ type });
    }
    seen.add(type);
  }
  return out.length ? out : undefined;
}

/** Attribute whitelist per known node type. Returns undefined when the node should be dropped. */
function sanitizeAttrs(type: string, raw: Attrs): { attrs?: Attrs } | null {
  switch (type) {
    case 'paragraph':
      return { attrs: compact({ textAlign: oneOf(raw.textAlign, TEXT_ALIGNS) }) };
    case 'heading': {
      const level = int(raw.level, 2, 4) ?? 2;
      return { attrs: compact({ level, textAlign: oneOf(raw.textAlign, TEXT_ALIGNS) }) };
    }
    case 'orderedList':
      return { attrs: compact({ start: int(raw.start, 1, 1_000_000) }) };
    case 'pullquote':
      return { attrs: compact({ cite: nonEmpty(raw.cite, 300) }) };
    case 'factbox':
      return { attrs: compact({ title: nonEmpty(raw.title, 300) }) };
    case 'image': {
      const mediaId = nonEmpty(raw.mediaId, 100);
      const src = safeSrc(raw.src);
      if (!mediaId && !src) return null;
      return {
        attrs: compact({
          mediaId,
          src,
          alt: str(raw.alt, 1000),
          caption: str(raw.caption, 2000),
          credit: str(raw.credit, 300),
          size: oneOf(raw.size, IMAGE_SIZES),
          width: int(raw.width, 1, 20_000),
          height: int(raw.height, 1, 20_000),
        }),
      };
    }
    case 'gallery': {
      const items: Attrs[] = [];
      if (Array.isArray(raw.items)) {
        for (const item of raw.items.slice(0, MAX_LIST_LENGTH)) {
          if (!isObject(item)) continue;
          const mediaId = nonEmpty(item.mediaId, 100);
          if (!mediaId) continue;
          items.push(
            compact({
              mediaId,
              src: safeSrc(item.src),
              alt: str(item.alt, 1000),
              caption: str(item.caption, 2000),
              credit: str(item.credit, 300),
            }) ?? { mediaId },
          );
        }
      }
      return { attrs: { items } };
    }
    case 'embed': {
      const url = typeof raw.url === 'string' ? raw.url.trim() : '';
      const info = embedInfo(url);
      if (!info) return null;
      const provider =
        isEmbedProvider(raw.provider) && raw.provider === info.provider ? raw.provider : info.provider;
      return {
        attrs: compact({
          provider,
          url,
          title: nonEmpty(raw.title, 300),
          aspect: oneOf(raw.aspect, ASPECTS) ?? info.aspect,
        }),
      };
    }
    case 'tableCell':
    case 'tableHeader': {
      const colwidth = Array.isArray(raw.colwidth)
        ? raw.colwidth.map((w) => int(w, 1, 10_000)).filter((w): w is number => w !== undefined)
        : undefined;
      return {
        attrs: compact({
          colspan: int(raw.colspan, 1, 100),
          rowspan: int(raw.rowspan, 1, 100),
          colwidth: colwidth && colwidth.length ? colwidth : undefined,
        }),
      };
    }
    case 'relatedArticles': {
      const ids = Array.isArray(raw.articleIds)
        ? [
            ...new Set(
              raw.articleIds.filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
            ),
          ].slice(0, 20)
        : [];
      return { attrs: { articleIds: ids } };
    }
    case 'liveBlog': {
      const liveBlogId = nonEmpty(raw.liveBlogId, 100);
      if (!liveBlogId) return null;
      return { attrs: { liveBlogId } };
    }
    case 'bulletList':
    case 'listItem':
    case 'blockquote':
    case 'horizontalRule':
    case 'hardBreak':
    case 'table':
    case 'tableRow':
    case 'text':
      return {};
    default:
      // Unknown node types are kept (children preserved) but their attrs are dropped.
      return {};
  }
}

type Budget = { nodes: number };

function sanitizeNode(raw: unknown, depth: number, budget: Budget): ContentNode | null {
  if (!isObject(raw) || typeof raw.type !== 'string' || !raw.type) return null;
  if (depth > MAX_DEPTH) return null;
  if (budget.nodes >= MAX_NODES) return null;
  budget.nodes += 1;

  const type = raw.type;
  if (type === 'doc') return null; // nested docs are not allowed

  if (type === 'text') {
    if (typeof raw.text !== 'string' || raw.text.length === 0) return null;
    const node: ContentNode = { type: 'text', text: raw.text.slice(0, MAX_TEXT_LENGTH) };
    const marks = sanitizeMarks(raw.marks);
    if (marks) node.marks = marks;
    return node;
  }

  const sanitized = sanitizeAttrs(type, isObject(raw.attrs) ? raw.attrs : {});
  if (!sanitized) return null;

  const node: ContentNode = { type };
  if (sanitized.attrs) node.attrs = sanitized.attrs;

  if (Array.isArray(raw.content) && raw.content.length) {
    const content: ContentNode[] = [];
    for (const child of raw.content) {
      const c = sanitizeNode(child, depth + 1, budget);
      if (c) content.push(c);
      if (budget.nodes >= MAX_NODES) break;
    }
    if (content.length) node.content = content;
  }
  return node;
}

/** Validate and clean a document. Never throws; garbage yields EMPTY_DOC. */
export function sanitizeDoc(input: unknown): ContentDoc {
  try {
    if (!isObject(input) || input.type !== 'doc') return EMPTY_DOC;
    if (!Array.isArray(input.content)) return { type: 'doc', content: [] };
    const budget: Budget = { nodes: 0 };
    const content: ContentNode[] = [];
    for (const child of input.content) {
      const c = sanitizeNode(child, 1, budget);
      if (c) content.push(c);
      if (budget.nodes >= MAX_NODES) break;
    }
    return { type: 'doc', content };
  } catch {
    return EMPTY_DOC;
  }
}

/** Number of nodes in a raw (unsanitised) tree, capped so counting itself is bounded. */
function countRawNodes(raw: unknown, cap: number): number {
  let count = 0;
  const stack: unknown[] = [raw];
  while (stack.length && count <= cap) {
    const n = stack.pop();
    if (!isObject(n)) continue;
    count += 1;
    if (Array.isArray(n.content)) for (const c of n.content) stack.push(c);
  }
  return count;
}

/**
 * Zod schema producing a sanitised ContentDoc. Rejects input that is not a
 * document at all, or that exceeds the size bound; otherwise cleans it.
 */
export const contentDocSchema: z.ZodType<ContentDoc, unknown> = z.unknown().transform((value, ctx) => {
  if (
    !isObject(value) ||
    value.type !== 'doc' ||
    (value.content !== undefined && !Array.isArray(value.content))
  ) {
    ctx.addIssue({ code: 'custom', message: 'Ugyldig innholdsdokument' });
    return z.NEVER;
  }
  if (countRawNodes(value, MAX_NODES) > MAX_NODES) {
    ctx.addIssue({ code: 'custom', message: `Dokumentet er for stort (maks ${MAX_NODES} elementer)` });
    return z.NEVER;
  }
  return sanitizeDoc(value);
});

/** True when the document has no visible content (only empty paragraphs). */
export function isEmptyDoc(doc: ContentDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true;
  return doc.content.every(
    (n) =>
      n.type === 'paragraph' &&
      (!n.content || n.content.every((c) => c.type === 'text' && !(c.text ?? '').trim())),
  );
}
