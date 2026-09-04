/**
 * Norwegian-aware slugify for the seed (æ→ae, ø→o, å→a, lower-case ASCII,
 * hyphen separated, max 80 chars). Mirrors the contract of
 * src/lib/text/slug.ts without depending on it.
 */
const REPLACEMENTS: Record<string, string> = {
  æ: 'ae',
  ø: 'o',
  å: 'a',
  ä: 'a',
  ö: 'o',
  ü: 'u',
  é: 'e',
  è: 'e',
  ê: 'e',
  ß: 'ss',
};

export function slugify(input: string, opts: { maxLength?: number } = {}): string {
  const maxLength = opts.maxLength ?? 80;
  let s = input.toLowerCase();
  s = s.replace(/[æøåäöüéèêß]/g, (ch) => REPLACEMENTS[ch] ?? ch);
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxLength) {
    s = s.slice(0, maxLength).replace(/-+$/g, '');
  }
  return s;
}
