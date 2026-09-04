import { describe, expect, it } from 'vitest';

import { isSlug, slugify, uniqueSlug } from './slug';

describe('slugify', () => {
  it('transliterates Norwegian letters', () => {
    expect(slugify('Blåbærsyltetøy fra Ålesund')).toBe('blabaersyltetoy-fra-alesund');
    expect(slugify('ÆØÅ æøå')).toBe('aeoa-aeoa');
  });

  it('strips diacritics and punctuation', () => {
    expect(slugify('Café «Résumé» – test!')).toBe('cafe-resume-test');
    expect(slugify('  Hello,   World!!  ')).toBe('hello-world');
    expect(slugify('Vær Varsom-plakaten (4.14)')).toBe('vaer-varsom-plakaten-4-14');
  });

  it('expands symbols meaningfully', () => {
    expect(slugify('Tine & Q-meieriene')).toBe('tine-og-q-meieriene');
    expect(slugify('50% rabatt')).toBe('50-prosent-rabatt');
  });

  it('collapses repeated separators and trims hyphens', () => {
    expect(slugify('--a---b--')).toBe('a-b');
    expect(slugify('___')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('cuts at a word boundary within maxLength (default 80)', () => {
    const long = Array.from({ length: 30 }, (_, i) => `ord${i}`).join(' ');
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.split('-').every((part) => /^ord\d+$/.test(part))).toBe(true);
    expect(slugify('kommunestyret vedtok budsjettet', { maxLength: 20 })).toBe('kommunestyret-vedtok');
  });

  it('never returns an empty slug when cutting a single long word', () => {
    expect(slugify('a'.repeat(100), { maxLength: 10 })).toBe('a'.repeat(10));
  });

  it('isSlug recognises its own output', () => {
    expect(isSlug(slugify('Elvebyen Tidende'))).toBe(true);
    expect(isSlug('Not A Slug')).toBe(false);
    expect(isSlug('-leading')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when free', async () => {
    expect(await uniqueSlug('sak', async () => false)).toBe('sak');
  });

  it('appends -2, -3 … on collisions', async () => {
    const taken = new Set(['sak', 'sak-2', 'sak-3']);
    expect(await uniqueSlug('sak', async (c) => taken.has(c))).toBe('sak-4');
  });

  it('probes candidates in order', async () => {
    const probed: string[] = [];
    await uniqueSlug('x', async (c) => {
      probed.push(c);
      return probed.length < 3;
    });
    expect(probed).toEqual(['x', 'x-2', 'x-3']);
  });

  it('uses a fallback base for empty input', async () => {
    expect(await uniqueSlug('', async () => false)).toBe('sak');
  });
});
