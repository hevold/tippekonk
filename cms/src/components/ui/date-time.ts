/**
 * Europe/Oslo conversions for <input type="datetime-local"> and display
 * formatting, implemented with Intl only (no date-fns-tz). Pure and testable.
 *
 * The datetime-local input value is wall-clock time with no zone. Desken
 * treats every such value as Europe/Oslo regardless of the browser's zone,
 * so an editor in Spain schedules publication in Norwegian time.
 */

export const OSLO_TZ = 'Europe/Oslo';

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone = OSLO_TZ): Parts {
  const out: Partial<Parts> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) {
    if (p.type === 'year') out.year = Number(p.value);
    else if (p.type === 'month') out.month = Number(p.value);
    else if (p.type === 'day') out.day = Number(p.value);
    else if (p.type === 'hour') out.hour = Number(p.value) % 24;
    else if (p.type === 'minute') out.minute = Number(p.value);
    else if (p.type === 'second') out.second = Number(p.value);
  }
  return {
    year: out.year ?? 1970,
    month: out.month ?? 1,
    day: out.day ?? 1,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
export function zoneOffsetMs(date: Date, timeZone = OSLO_TZ): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → "YYYY-MM-DDTHH:mm" in Europe/Oslo (empty string for null/invalid). */
export function toOsloInputValue(date: Date | null | undefined, timeZone = OSLO_TZ): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm[:ss]" interpreted as Europe/Oslo wall time → Date (null when empty/invalid). */
export function fromOsloInputValue(value: string | null | undefined, timeZone = OSLO_TZ): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s ?? '0');
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  // Treat the wall time as UTC, then subtract the zone offset at that instant.
  // Iterate twice to settle across DST transitions.
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = guess - zoneOffsetMs(new Date(guess), timeZone);
  utc = guess - zoneOffsetMs(new Date(utc), timeZone);
  const result = new Date(utc);
  if (Number.isNaN(result.getTime())) return null;
  // Validate the calendar date really exists (e.g. 31 February rolls over).
  const check = zonedParts(result, timeZone);
  if (check.month !== month || check.day !== day) return null;
  return result;
}

/** Current time as an Oslo input value, rounded up to the next `stepMinutes`. */
export function nextOsloInputValue(now = new Date(), stepMinutes = 5): string {
  const ms = stepMinutes * 60_000;
  const rounded = new Date(Math.ceil(now.getTime() / ms) * ms);
  return toOsloInputValue(rounded);
}
