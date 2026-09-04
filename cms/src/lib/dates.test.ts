import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatRelative,
  formatTime,
  fromLocalInputValue,
  fromOsloParts,
  isSameOsloDay,
  osloOffsetMinutes,
  toLocalInputValue,
  TZ,
  zonedParts,
} from './dates';

describe('dates (Europe/Oslo)', () => {
  it('exports the zone', () => {
    expect(TZ).toBe('Europe/Oslo');
  });

  it('formats in Oslo time regardless of process zone (CEST)', () => {
    const d = new Date('2026-09-04T12:02:00Z'); // 14:02 CEST
    expect(formatDate(d)).toBe('4. sep. 2026');
    expect(formatDate(d, 'datetime')).toBe('4. sep. 2026 14:02');
    expect(formatDate(d, 'time')).toBe('14:02');
    expect(formatDate(d, 'long')).toBe('4. september 2026');
    expect(formatDate(d, 'weekday')).toBe('fredag 4. september 2026');
    expect(formatDate(d, 'iso-date')).toBe('2026-09-04');
  });

  it('formats in winter time (CET)', () => {
    const d = new Date('2026-01-15T13:30:00Z'); // 14:30 CET
    expect(formatDate(d, 'datetime')).toBe('15. jan. 2026 14:30');
    expect(osloOffsetMinutes(d)).toBe(60);
    expect(osloOffsetMinutes(new Date('2026-07-01T00:00:00Z'))).toBe(120);
  });

  it('handles the DST switch day', () => {
    // 29 March 2026: clocks go from 02:00 to 03:00 CET→CEST.
    const before = new Date('2026-03-29T00:30:00Z'); // 01:30 CET
    const after = new Date('2026-03-29T01:30:00Z'); // 03:30 CEST
    expect(formatTime(before)).toBe('01:30');
    expect(formatTime(after)).toBe('03:30');
    expect(isSameOsloDay(before, after)).toBe(true);
  });

  it('returns empty for invalid input', () => {
    expect(formatDate('not a date')).toBe('');
    expect(formatRelative('nope')).toBe('');
  });

  it('exposes zoned parts', () => {
    const p = zonedParts(new Date('2026-09-04T22:30:00Z')); // 00:30 next day in Oslo
    expect(p).toMatchObject({ year: 2026, month: 9, day: 5, hour: 0, minute: 30, weekday: 6 });
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-09-04T12:02:00Z'); // fredag 14:02 CEST

  it('handles just now and minutes', () => {
    expect(formatRelative(new Date(now.getTime() - 10_000), now)).toBe('akkurat nå');
    expect(formatRelative(new Date(now.getTime() - 60_000), now)).toBe('for 1 minutt siden');
    expect(formatRelative(new Date(now.getTime() - 3 * 60_000), now)).toBe('for 3 minutter siden');
    expect(formatRelative(new Date(now.getTime() - 59 * 60_000), now)).toBe('for 59 minutter siden');
  });

  it('handles hours on the same day', () => {
    expect(formatRelative(new Date(now.getTime() - 60 * 60_000), now)).toBe('for 1 time siden');
    expect(formatRelative(new Date(now.getTime() - 2 * 60 * 60_000), now)).toBe('for 2 timer siden');
  });

  it('handles yesterday with a clock time', () => {
    const yesterday = new Date('2026-09-03T12:02:00Z');
    expect(formatRelative(yesterday, now)).toBe('i går 14:02');
    // Late last night is still "i går" even though it is < 24 h ago.
    const lateLastNight = new Date('2026-09-03T21:30:00Z'); // 23:30 CEST
    expect(formatRelative(lateLastNight, now)).toBe('i går 23:30');
  });

  it('handles same year and older dates', () => {
    expect(formatRelative(new Date('2026-09-01T12:02:00Z'), now)).toBe('1. sep. 14:02');
    expect(formatRelative(new Date('2025-09-03T12:02:00Z'), now)).toBe('3. sep. 2025');
  });

  it('handles the future', () => {
    expect(formatRelative(new Date(now.getTime() + 5 * 60_000), now)).toBe('om 5 minutter');
    expect(formatRelative(new Date(now.getTime() + 3 * 60 * 60_000), now)).toBe('om 3 timer');
    expect(formatRelative(new Date('2026-09-05T07:00:00Z'), now)).toBe('i morgen 09:00');
  });
});

describe('datetime-local conversion', () => {
  it('round-trips through Oslo wall-clock time', () => {
    const d = new Date('2026-09-04T12:02:00Z');
    expect(toLocalInputValue(d)).toBe('2026-09-04T14:02');
    expect(fromLocalInputValue('2026-09-04T14:02')?.toISOString()).toBe('2026-09-04T12:02:00.000Z');
    expect(fromLocalInputValue('2026-01-15T14:30')?.toISOString()).toBe('2026-01-15T13:30:00.000Z');
  });

  it('handles null and garbage', () => {
    expect(toLocalInputValue(null)).toBe('');
    expect(fromLocalInputValue('')).toBeNull();
    expect(fromLocalInputValue('2026-02-31T10:00')).toBeNull();
    expect(fromLocalInputValue('garbage')).toBeNull();
  });

  it('resolves across the DST gap forward', () => {
    // 02:30 on 29 March 2026 does not exist in Oslo; resolve to a valid instant.
    const d = fromOsloParts({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 });
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(zonedParts(d).day).toBe(29);
  });
});
