import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { cachedRead, reviveDates } from './cached';

describe('reviveDates', () => {
  it('turns ISO strings under timestamp keys back into Dates, recursively', () => {
    const out = reviveDates({
      publishedAt: '2026-09-03T12:00:00.000Z',
      updatedAt: '2026-09-03T12:00:00Z',
      title: '2026-09-03T12:00:00.000Z',
      nested: { list: [{ createdAt: '2026-01-01T00:00:00+01:00', deletedAt: null }] },
      media: { m1: { takenAt: '2026-02-02T10:00:00.000Z', alt: 'x' } },
      already: new Date('2026-05-05T00:00:00Z'),
    });
    expect(out.publishedAt).toBeInstanceOf(Date);
    expect(out.updatedAt).toBeInstanceOf(Date);
    expect(out.title).toBe('2026-09-03T12:00:00.000Z');
    expect(out.nested.list[0]!.createdAt).toBeInstanceOf(Date);
    expect((out.nested.list[0]!.createdAt as unknown as Date).toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(out.nested.list[0]!.deletedAt).toBeNull();
    expect(out.media.m1.takenAt).toBeInstanceOf(Date);
    expect(out.media.m1.alt).toBe('x');
    expect(out.already).toBeInstanceOf(Date);
  });

  it('leaves non-ISO strings and primitives alone', () => {
    expect(reviveDates({ publishedAt: 'i går', n: 3, b: true })).toEqual({
      publishedAt: 'i går',
      n: 3,
      b: true,
    });
    expect(reviveDates(null)).toBeNull();
    expect(reviveDates([1, 'a'])).toEqual([1, 'a']);
  });
});

describe('cachedRead (test mode)', () => {
  it('calls through and revives dates', async () => {
    const fn = vi.fn(async (id: string) => ({ id, publishedAt: '2026-09-03T12:00:00.000Z' }));
    const read = cachedRead(fn, ['t'], { siteId: 's' });
    const out = await read('x');
    expect(fn).toHaveBeenCalledWith('x');
    expect(out.id).toBe('x');
    expect(out.publishedAt).toBeInstanceOf(Date);
  });
});
