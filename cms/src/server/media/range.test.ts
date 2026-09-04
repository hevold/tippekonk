import { describe, expect, it } from 'vitest';

import { contentRange, parseRange } from './range';

describe('parseRange', () => {
  it('returns null without a header or for unknown units', () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange('', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBeNull();
  });

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange(' bytes=0-0 ', 1)).toEqual({ start: 0, end: 0 });
  });

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('flags unsatisfiable ranges', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=5-2', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1', 0)).toBe('unsatisfiable');
  });

  it('formats Content-Range', () => {
    expect(contentRange({ start: 0, end: 499 }, 1000)).toBe('bytes 0-499/1000');
  });
});
