import { describe, expect, it } from 'vitest';

import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
  formatWeekdayDate,
  osloHour,
} from './format';

/** Intl uses non-breaking spaces as separators; normalise for assertions. */
const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('format (nb-NO, Europe/Oslo)', () => {
  const instant = new Date('2026-09-04T12:02:00Z'); // 14:02 CEST

  it('formats date and time', () => {
    expect(norm(formatDateTime(instant))).toBe('4. sep. 2026 14:02');
    expect(norm(formatDate(instant))).toBe('4. sep. 2026');
    expect(formatTime(instant)).toBe('14:02');
    expect(norm(formatWeekdayDate(instant))).toBe('fredag 4. september');
  });

  it('returns empty strings for invalid input', () => {
    expect(formatDateTime('not a date')).toBe('');
    expect(formatTime(NaN)).toBe('');
  });

  it('formats relative times in bokmål', () => {
    const now = new Date('2026-09-04T12:00:00Z');
    expect(formatRelative(new Date('2026-09-04T11:59:50Z'), now)).toBe('nå nettopp');
    expect(formatRelative(new Date('2026-09-04T11:57:00Z'), now)).toBe('for 3 minutter siden');
    expect(formatRelative(new Date('2026-09-04T11:59:00Z'), now)).toBe('for 1 minutt siden');
    expect(formatRelative(new Date('2026-09-04T10:00:00Z'), now)).toBe('for 2 timer siden');
    expect(formatRelative(new Date('2026-09-04T05:00:00Z'), now)).toBe('i dag 07:00');
    expect(formatRelative(new Date('2026-09-03T12:02:00Z'), now)).toBe('i går 14:02');
    expect(formatRelative(new Date('2026-09-05T12:02:00Z'), now)).toBe('i morgen 14:02');
    expect(formatRelative(new Date('2026-09-04T12:05:00Z'), now)).toBe('om 5 minutter');
    expect(norm(formatRelative(new Date('2026-08-01T12:02:00Z'), now))).toBe('1. aug. 2026 14:02');
  });

  it('formats numbers with Norwegian grouping', () => {
    expect(norm(formatNumber(1250))).toBe('1 250');
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(Number.NaN)).toBe('–');
  });

  it('reads the Oslo hour', () => {
    expect(osloHour(new Date('2026-07-01T22:30:00Z'))).toBe(0);
    expect(osloHour(new Date('2026-01-15T07:00:00Z'))).toBe(8);
  });
});
