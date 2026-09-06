/**
 * Cache wrapper for public reads.
 *
 * `cachedPublic()` (unstable_cache) stores results as JSON, so every `Date`
 * comes back as an ISO string on a cache hit. `cachedRead()` wraps a query
 * with the site cache tags and revives the timestamp fields afterwards so
 * callers always see real `Date` objects, hit or miss.
 *
 * In tests (`NODE_ENV=test`) and in scripts without a Next.js incremental
 * cache the query runs directly — the revival step still applies so both
 * paths behave identically.
 */
import 'server-only';

import { isTest } from '@/env';
import { cachedPublic } from '@/server/cache';

/** Column names that hold timestamps anywhere in the public read models. */
const DATE_KEYS = new Set([
  'publishedAt',
  'firstPublishedAt',
  'updatedAt',
  'createdAt',
  'scheduledAt',
  'unpublishedAt',
  'deletedAt',
  'startedAt',
  'endedAt',
  'takenAt',
  'lastSeenAt',
  'lastUsedAt',
]);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Recursively turn ISO strings under known timestamp keys back into Date objects. */
export function reviveDates<T>(value: T): T {
  return revive(value, null) as T;
}

function revive(value: unknown, key: string | null): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (key && DATE_KEYS.has(key) && ISO_RE.test(value)) {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    return value;
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => revive(v, key));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = revive(v, k);
    return out;
  }
  return value;
}

function isCacheUnavailable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE;
  if (code === 'E469') return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('incrementalCache missing');
}

export type CachedReadOptions = { siteId: string; tags?: string[]; revalidate?: number };

/**
 * Wrap a query so its result is cached per site (and extra tags) and its
 * timestamps are revived. `keyParts` must identify the query; the arguments
 * are part of the cache key automatically.
 */
export function cachedRead<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: CachedReadOptions,
): (...args: TArgs) => Promise<TResult> {
  if (isTest) {
    return async (...args: TArgs) => reviveDates(await fn(...args));
  }
  const wrapped = cachedPublic(fn, keyParts, options);
  return async (...args: TArgs) => {
    try {
      return reviveDates(await wrapped(...args));
    } catch (err) {
      if (!isCacheUnavailable(err)) throw err;
      return reviveDates(await fn(...args));
    }
  };
}
