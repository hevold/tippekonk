/**
 * Small, pure text helpers shared by server and client code: truncation,
 * excerpts, whitespace normalisation, word counting and Norwegian number
 * formatting. Slugs live in ./slug.ts.
 */

export { isSlug, slugify, uniqueSlug } from './slug';

export const ELLIPSIS = '…';

/** Collapse runs of whitespace (including NBSP and newlines) into single spaces and trim. */
export function normalizeWhitespace(text: string): string {
  return String(text ?? '')
    .replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, ' ')
    .trim();
}

/** Hard cut to `max` characters (grapheme-safe enough for editorial text), adding an ellipsis when cut. */
export function truncate(text: string, max: number, ellipsis: string = ELLIPSIS): string {
  const s = String(text ?? '');
  if (max <= 0) return '';
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  const keep = Math.max(0, max - Array.from(ellipsis).length);
  return (
    chars
      .slice(0, keep)
      .join('')
      .replace(/[\s,;:–-]+$/u, '') + ellipsis
  );
}

/**
 * Excerpt for teasers and meta descriptions: whitespace-normalised and cut at
 * a word boundary near `maxChars` (default 160), with an ellipsis when cut.
 */
export function excerpt(text: string, maxChars: number = 160): string {
  const s = normalizeWhitespace(text);
  if (maxChars <= 0) return '';
  if (Array.from(s).length <= maxChars) return s;
  const limit = Math.max(1, maxChars - 1);
  const head = Array.from(s).slice(0, limit).join('');
  const lastSpace = head.lastIndexOf(' ');
  // Only cut at the boundary when it keeps a reasonable amount of text.
  const cut = lastSpace > limit * 0.5 ? head.slice(0, lastSpace) : head;
  return cut.replace(/[\s,;:.!?–-]+$/u, '') + ELLIPSIS;
}

/** Count words: sequences of letters/digits, so "Vær Varsom-plakaten" counts as 3 and "1 250" as 2. */
export function countWords(text: string): number {
  const s = String(text ?? '');
  if (!s.trim()) return 0;
  const matches = s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

/** "kari nordmann" → "Kari nordmann" (sentence case for UI copy generated from data). */
export function capitalizeFirst(text: string): string {
  const s = String(text ?? '');
  if (!s) return s;
  const first = Array.from(s)[0] ?? '';
  return first.toLocaleUpperCase('nb-NO') + s.slice(first.length);
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Norwegian number formatting: 1250 → "1 250" (non-breaking space as the
 * thousands separator, comma as the decimal separator).
 */
export function formatNumber(value: number, opts: Intl.NumberFormatOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  const key = JSON.stringify(opts);
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('nb-NO', opts);
    numberFormats.set(key, f);
  }
  // ICU versions differ between NBSP and narrow NBSP for the group separator; normalise.
  return f.format(value).replace(/[   ]/g, ' ');
}

/** "3 min", "1 time" style compact durations for reading time. */
export function formatReadingTime(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  return `${m} min`;
}

/** Simple pluralisation helper for bokmål: pluralize(1, 'sak', 'saker') → "1 sak". */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}
