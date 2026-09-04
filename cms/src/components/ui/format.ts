/**
 * Norwegian formatting helpers used by the design system (Europe/Oslo, nb-NO).
 * Pure and testable. The content area owns the richer `@/lib/dates`; these
 * exist so UI components have no cross-area dependency.
 */
import { OSLO_TZ } from './date-time';

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('nb-NO', { timeZone: OSLO_TZ, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "4. sep. 2026 14:02" */
export function formatDateTime(d: Date | string | number): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  const day = fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  const time = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  return `${day} ${time}`;
}

/** "4. sep. 2026" */
export function formatDate(d: Date | string | number): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** "14:02" */
export function formatTime(d: Date | string | number): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** "torsdag 4. september" */
export function formatWeekdayDate(d: Date | string | number): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  return fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/**
 * Relative time in bokmål: "nå nettopp", "for 3 minutter siden", "for 2 timer siden",
 * "i går 14:02", else an absolute date. Future dates: "om 5 minutter".
 */
export function formatRelative(d: Date | string | number, now: Date = new Date()): string {
  const date = toDate(d);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  const min = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);

  const wrap = (s: string) => (future ? `om ${s}` : `for ${s} siden`);

  if (sec < 45) return future ? 'om et øyeblikk' : 'nå nettopp';
  if (min < 60) return wrap(min === 1 ? '1 minutt' : `${min} minutter`);
  if (hours < 6) return wrap(hours === 1 ? '1 time' : `${hours} timer`);

  const dayNow = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const dayThen = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  if (dayNow === dayThen) return `i dag ${formatTime(date)}`;
  const yesterday = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now.getTime() - 86_400_000),
  );
  if (dayThen === yesterday) return `i går ${formatTime(date)}`;
  const tomorrow = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now.getTime() + 86_400_000),
  );
  if (dayThen === tomorrow) return `i morgen ${formatTime(date)}`;
  return formatDateTime(date);
}

const numberFmt = new Intl.NumberFormat('nb-NO');

/** "1 250" (Norwegian thousands separator). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '–';
  return numberFmt.format(n);
}

/** Hour (0–23) in Europe/Oslo for the given instant. */
export function osloHour(d: Date = new Date()): number {
  const h = Number(fmt({ hour: 'numeric', hourCycle: 'h23' }).format(d).replace(/\D/g, ''));
  return Number.isFinite(h) ? h % 24 : 0;
}
