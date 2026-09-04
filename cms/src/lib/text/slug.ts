/**
 * Slug generation with Norwegian transliteration.
 *
 *   slugify('Kommunestyret vedtok budsjettet – Ålesund jubler')
 *     → 'kommunestyret-vedtok-budsjettet-alesund-jubler'
 *
 * `uniqueSlug()` appends `-2`, `-3`, … until the `exists` probe says the
 * candidate is free; the article service uses it with a per-site lookup.
 */

const DEFAULT_MAX_LENGTH = 80;

/** Characters that NFKD normalisation does not split into base + diacritic. */
const TRANSLITERATIONS: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ß: 'ss',
  ð: 'd',
  þ: 'th',
  œ: 'oe',
  đ: 'd',
  ł: 'l',
  '&': ' og ',
  '@': ' at ',
  '€': ' euro ',
  $: ' dollar ',
  '%': ' prosent ',
  '+': ' pluss ',
};

/** Lower-case ASCII slug: æ→ae, ø→o, å→a, diacritics stripped, non-alphanumerics → single hyphens. */
export function slugify(input: string, opts: { maxLength?: number } = {}): string {
  const maxLength = Math.max(1, opts.maxLength ?? DEFAULT_MAX_LENGTH);
  let s = String(input ?? '').toLowerCase();
  s = s.replace(/[æøåßðþœđł&@€$%+]/g, (ch) => TRANSLITERATIONS[ch] ?? ch);
  // Split accented letters into base + combining mark, then drop the marks (é → e, ü → u).
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLength) {
    const cutsMidWord = s[maxLength] !== '-';
    s = s.slice(0, maxLength);
    // Prefer cutting at a word boundary, but never return an empty slug.
    const lastHyphen = s.lastIndexOf('-');
    if (cutsMidWord && lastHyphen > 0) s = s.slice(0, lastHyphen);
    s = s.replace(/-+$/g, '');
  }
  return s;
}

/**
 * Find a free slug by probing `base`, `base-2`, `base-3`, …
 * The probe returns true when the candidate is taken.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || 'sak';
  if (!(await exists(root))) return root;
  for (let n = 2; n < 10_000; n++) {
    const candidate = `${root}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Astronomically unlikely; fall back to a timestamp suffix so we never loop forever.
  return `${root}-${Date.now().toString(36)}`;
}

/** True when `value` already is a well-formed slug (what slugify would output). */
export function isSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}
