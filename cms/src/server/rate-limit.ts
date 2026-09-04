/**
 * In-memory fixed-window rate limiter for login, password reset and other
 * abuse-prone endpoints. One process = one window store, which is fine for a
 * single-instance newsroom install; the keys are cheap strings such as
 * `login:<ip>:<email>`.
 *
 *   const { ok, retryAfterSec } = rateLimit(`login:${ip}:${email}`, { limit: 10, windowMs: 15 * 60_000 });
 *
 * Expired entries are pruned opportunistically so the map never grows without
 * bound under a scan.
 */

type Bucket = { count: number; resetAt: number };

const g = globalThis as unknown as { __deskenRateLimit?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (g.__deskenRateLimit ??= new Map());

/** Prune every N calls or whenever the map gets large. */
const PRUNE_EVERY = 500;
const PRUNE_THRESHOLD = 10_000;
let callsSincePrune = 0;

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitResult = { ok: boolean; retryAfterSec: number; remaining: number };

/**
 * Count one hit against `key`. Returns `ok: false` when the window's limit is
 * exceeded, with the seconds until the window resets.
 */
export function rateLimit(key: string, opts: RateLimitOptions, now: number = Date.now()): RateLimitResult {
  callsSincePrune += 1;
  if (callsSincePrune >= PRUNE_EVERY || buckets.size > PRUNE_THRESHOLD) {
    callsSincePrune = 0;
    prune(now);
  }

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  if (bucket.count > opts.limit) {
    return { ok: false, retryAfterSec, remaining: 0 };
  }
  return { ok: true, retryAfterSec: 0, remaining: opts.limit - bucket.count };
}

/** Forget a key (e.g. after a successful login) so the user is not penalised further. */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

/** Drop every bucket (tests). */
export function resetRateLimits(): void {
  buckets.clear();
  callsSincePrune = 0;
}

/** Number of tracked keys (tests / diagnostics). */
export function rateLimitSize(): number {
  return buckets.size;
}
