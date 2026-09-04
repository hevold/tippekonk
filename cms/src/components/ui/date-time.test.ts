import { describe, expect, it } from 'vitest';

import {
  fromOsloInputValue,
  nextOsloInputValue,
  toOsloInputValue,
  zoneOffsetMs,
  zonedParts,
} from './date-time';

describe('date-time (Europe/Oslo)', () => {
  it('formats an instant as Oslo wall time (CET, +01:00)', () => {
    expect(toOsloInputValue(new Date('2026-01-15T11:00:00Z'))).toBe('2026-01-15T12:00');
  });

  it('formats an instant as Oslo wall time (CEST, +02:00)', () => {
    expect(toOsloInputValue(new Date('2026-07-01T10:00:00Z'))).toBe('2026-07-01T12:00');
  });

  it('returns an empty string for null and invalid dates', () => {
    expect(toOsloInputValue(null)).toBe('');
    expect(toOsloInputValue(new Date('nonsense'))).toBe('');
  });

  it('parses Oslo wall time into the correct UTC instant', () => {
    expect(fromOsloInputValue('2026-01-15T12:00')?.toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(fromOsloInputValue('2026-07-01T12:00')?.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(fromOsloInputValue('2026-07-01T12:00:30')?.toISOString()).toBe('2026-07-01T10:00:30.000Z');
  });

  it('round-trips across the DST switch days', () => {
    // 2026-03-29 02:00 CET → 03:00 CEST; 2026-10-25 03:00 CEST → 02:00 CET.
    for (const v of [
      '2026-03-29T01:30',
      '2026-03-29T03:30',
      '2026-10-25T01:30',
      '2026-10-25T04:00',
      '2026-12-31T23:59',
    ]) {
      const d = fromOsloInputValue(v);
      expect(d).not.toBeNull();
      expect(toOsloInputValue(d)).toBe(v);
    }
  });

  it('rejects malformed and impossible values', () => {
    expect(fromOsloInputValue('')).toBeNull();
    expect(fromOsloInputValue(null)).toBeNull();
    expect(fromOsloInputValue('2026-13-01T10:00')).toBeNull();
    expect(fromOsloInputValue('2026-02-31T10:00')).toBeNull();
    expect(fromOsloInputValue('2026-02-10T25:00')).toBeNull();
    expect(fromOsloInputValue('10.02.2026 12:00')).toBeNull();
  });

  it('computes zone offsets and parts', () => {
    expect(zoneOffsetMs(new Date('2026-01-15T11:00:00Z'))).toBe(3_600_000);
    expect(zoneOffsetMs(new Date('2026-07-01T10:00:00Z'))).toBe(7_200_000);
    expect(zonedParts(new Date('2026-07-01T22:30:00Z'))).toMatchObject({
      year: 2026,
      month: 7,
      day: 2,
      hour: 0,
      minute: 30,
    });
  });

  it('rounds "now" up to the next step', () => {
    expect(nextOsloInputValue(new Date('2026-07-01T10:01:00Z'), 5)).toBe('2026-07-01T12:05');
    expect(nextOsloInputValue(new Date('2026-07-01T10:05:00Z'), 5)).toBe('2026-07-01T12:05');
  });
});
