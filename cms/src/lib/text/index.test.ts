import { describe, expect, it } from 'vitest';

import {
  capitalizeFirst,
  countWords,
  excerpt,
  formatNumber,
  normalizeWhitespace,
  pluralize,
  truncate,
} from './index';

describe('normalizeWhitespace', () => {
  it('collapses whitespace including NBSP and newlines', () => {
    expect(normalizeWhitespace('  a \n\n b  c\t d ')).toBe('a b c d');
  });
});

describe('truncate', () => {
  it('returns short strings untouched', () => {
    expect(truncate('hei', 10)).toBe('hei');
  });
  it('cuts and adds an ellipsis, trimming trailing punctuation', () => {
    expect(truncate('Dette er en lang setning, ja', 12)).toBe('Dette er en…');
  });
  it('handles multi-byte characters', () => {
    expect(truncate('ÆØÅ ÆØÅ ÆØÅ', 5)).toBe('ÆØÅ…');
  });
});

describe('excerpt', () => {
  it('cuts at a word boundary near the limit', () => {
    const text = 'Kommunestyret vedtok torsdag kveld et budsjett som gir mer penger til skolene i Elvebyen.';
    const out = excerpt(text, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('Kommunestyret vedtok torsdag kveld et…');
  });
  it('returns the whole text when it fits', () => {
    expect(excerpt('Kort tekst', 160)).toBe('Kort tekst');
  });
});

describe('countWords', () => {
  it('counts words with Norwegian letters and hyphens', () => {
    expect(countWords('Vær Varsom-plakaten gjelder')).toBe(4);
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('1 250 kroner')).toBe(3);
    expect(countWords("Ola's bil")).toBe(2);
  });
});

describe('capitalizeFirst', () => {
  it('upper-cases the first character only', () => {
    expect(capitalizeFirst('ålesund by')).toBe('Ålesund by');
    expect(capitalizeFirst('')).toBe('');
  });
});

describe('formatNumber', () => {
  it('formats with Norwegian grouping', () => {
    expect(formatNumber(1250)).toBe('1 250');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1234567.5, { maximumFractionDigits: 1 })).toBe('1 234 567,5');
    expect(formatNumber(Number.NaN)).toBe('');
  });
  it('pluralizes with the formatted count', () => {
    expect(pluralize(1, 'sak', 'saker')).toBe('1 sak');
    expect(pluralize(1250, 'sak', 'saker')).toBe('1 250 saker');
  });
});
