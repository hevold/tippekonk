import { describe, expect, it } from 'vitest';

import { paginationRange } from './pagination-range';

describe('paginationRange', () => {
  it('returns nothing for zero pages', () => {
    expect(paginationRange(1, 0)).toEqual([]);
  });

  it('lists every page when there are few', () => {
    expect(paginationRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses the right side near the start', () => {
    expect(paginationRange(1, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20]);
    expect(paginationRange(3, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20]);
  });

  it('collapses both sides in the middle', () => {
    expect(paginationRange(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });

  it('collapses the left side near the end', () => {
    expect(paginationRange(19, 20)).toEqual([1, 'ellipsis', 16, 17, 18, 19, 20]);
  });

  it('clamps out-of-range pages', () => {
    expect(paginationRange(99, 20)).toEqual([1, 'ellipsis', 16, 17, 18, 19, 20]);
    expect(paginationRange(-4, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 20]);
  });
});
