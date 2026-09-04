/**
 * Date formatting for Desken: everything is displayed in Europe/Oslo with
 * nb-NO conventions, regardless of the server's or browser's zone.
 *
 *   formatDate(d)              → "4. sep. 2026"
 *   formatDate(d, 'datetime')  → "4. sep. 2026 14:02"
 *   formatRelative(d)          → "for 3 minutter siden" | "i går 14:02" | "3. sep. 14:02" | "3. sep. 2025"
 *   toLocalInputValue(d)       → "2026-09-04T14:02"  (for <input type="datetime-local">)
 *   fromLocalInputValue(v)     → Date (interpreting v as Oslo wall-clock time)
 *
 * Implemented with Intl (no date-fns-tz); date-fns is used for plain
 * arithmetic where it reads better.
 */
import { differenceInMinutes, differenceInSeconds } from 'date-fns';

export const TZ = 'Europe/Oslo';
export const LOCALE = 'nb-NO';

export type DateStyle = 'short' | 'long' | 'time' | 'datetime' | 'weekday' | 'iso-date';

type DateInput = Date | string | number;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions, locale: string = LOCALE): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: TZ, ...options });
    formatterCache.set(key, f);
  }
  return f;
}

/** Normalise input; returns null for unparsable values so callers can render "". */
export function toDate(input: DateInput | null | undefined): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday … 6 = Saturday, in Europe/Oslo. */
  weekday: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Wall-clock parts of `date` in Europe/Oslo. */
export function zonedParts(date: Date): ZonedParts {
  const parts = formatter(
    {
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    },
    'en-US',
  ).formatToParts(date);
  const out: ZonedParts = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0, weekday: 4 };
  for (const p of parts) {
    switch (p.type) {
      case 'year':
        out.year = Number(p.value);
        break;
      case 'month':
        out.month = Number(p.value);
        break;
      case 'day':
        out.day = Number(p.value);
        break;
      case 'hour':
        out.hour = Number(p.value) % 24;
        break;
      case 'minute':
        out.minute = Number(p.value);
        break;
      case 'second':
        out.second = Number(p.value);
        break;
      case 'weekday':
        out.weekday = Math.max(0, WEEKDAYS.indexOf(p.value));
        break;
    }
  }
  return out;
}

/** Offset of Europe/Oslo from UTC at `date`, in minutes (60 in winter, 120 in summer). */
export function osloOffsetMinutes(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** Build a Date from Europe/Oslo wall-clock parts (handles DST; ambiguous/skipped hours resolve forward). */
export function fromOsloParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  // Two-pass offset resolution: guess with the offset at the naive instant, then correct.
  let guess = naive - osloOffsetMinutes(new Date(naive)) * 60_000;
  const corrected = naive - osloOffsetMinutes(new Date(guess)) * 60_000;
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** Midnight in Europe/Oslo of the day containing `date`. */
export function startOfOsloDay(date: Date): Date {
  const p = zonedParts(date);
  return fromOsloParts({ year: p.year, month: p.month, day: p.day });
}

/** Same calendar day in Europe/Oslo. */
export function isSameOsloDay(a: Date, b: Date): boolean {
  const pa = zonedParts(a);
  const pb = zonedParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Whole calendar days between a and b in Europe/Oslo (b - a); 1 when b is the day after a. */
export function osloDayDifference(a: Date, b: Date): number {
  const da = startOfOsloDay(a).getTime();
  const db = startOfOsloDay(b).getTime();
  return Math.round((db - da) / 86_400_000);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "14:02" */
export function formatTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  const p = zonedParts(d);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Format a date in nb-NO / Europe/Oslo. Unparsable input yields "". */
export function formatDate(input: DateInput, style: DateStyle = 'short'): string {
  const d = toDate(input);
  if (!d) return '';
  switch (style) {
    case 'short':
      return formatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    case 'long':
      return formatter({ day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    case 'time':
      return formatTime(d);
    case 'datetime':
      return `${formatter({ day: 'numeric', month: 'short', year: 'numeric' }).format(d)} ${formatTime(d)}`;
    case 'weekday':
      return formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    case 'iso-date': {
      const p = zonedParts(d);
      return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    }
  }
}

/** "3. sep." — day and short month without year. */
export function formatDayMonth(input: DateInput): string {
  const d = toDate(input);
  if (!d) return '';
  return formatter({ day: 'numeric', month: 'short' }).format(d);
}

/**
 * Relative time in bokmål for lists and bylines:
 *   < 45 s        "akkurat nå"
 *   < 60 min      "for 3 minutter siden" / "for 1 minutt siden"
 *   same day      "for 2 timer siden" / "for 1 time siden"
 *   yesterday     "i går 14:02"
 *   same year     "3. sep. 14:02"
 *   otherwise     "3. sep. 2025"
 * Future instants mirror this: "om 5 minutter", "om 2 timer", "i morgen 14:02".
 */
export function formatRelative(input: DateInput, now: Date = new Date()): string {
  const d = toDate(input);
  if (!d) return '';
  const seconds = differenceInSeconds(now, d);
  const abs = Math.abs(seconds);
  const past = seconds >= 0;
  if (abs < 45) return 'akkurat nå';

  const minutes = Math.abs(differenceInMinutes(now, d));
  if (minutes < 60) {
    const n = Math.max(1, minutes);
    const unit = n === 1 ? 'minutt' : 'minutter';
    return past ? `for ${n} ${unit} siden` : `om ${n} ${unit}`;
  }

  if (isSameOsloDay(d, now)) {
    const hours = Math.max(1, Math.floor(minutes / 60));
    const unit = hours === 1 ? 'time' : 'timer';
    return past ? `for ${hours} ${unit} siden` : `om ${hours} ${unit}`;
  }

  const dayDiff = osloDayDifference(now, d); // -1 = yesterday, +1 = tomorrow
  if (dayDiff === -1) return `i går ${formatTime(d)}`;
  if (dayDiff === 1) return `i morgen ${formatTime(d)}`;

  if (zonedParts(d).year === zonedParts(now).year) {
    return `${formatDayMonth(d)} ${formatTime(d)}`;
  }
  return formatDate(d, 'short');
}

/** Value for <input type="datetime-local"> showing Europe/Oslo wall-clock time; "" for null. */
export function toLocalInputValue(input: Date | string | null | undefined): string {
  const d = toDate(input ?? null);
  if (!d) return '';
  const p = zonedParts(d);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Parse a datetime-local value ("2026-09-04T14:02[:ss]") as Europe/Oslo wall-clock time. */
export function fromLocalInputValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, da, h = '0', mi = '0', s = '0'] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(da);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const d = fromOsloParts({ year, month, day, hour, minute, second });
  // Reject impossible dates such as 31 February (they roll over).
  const p = zonedParts(d);
  if (p.year !== year || p.month !== month || p.day !== day) return null;
  return d;
}

/** ISO 8601 with offset, e.g. for <time dateTime>. */
export function toIso(input: DateInput): string {
  const d = toDate(input);
  return d ? d.toISOString() : '';
}

/** Elements for `<time dateTime={..}>{..}</time>` in one call. */
export function timeAttrs(
  input: DateInput,
  style: DateStyle = 'datetime',
): { dateTime: string; label: string } {
  return { dateTime: toIso(input), label: formatDate(input, style) };
}
