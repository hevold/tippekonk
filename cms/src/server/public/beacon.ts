/**
 * Pageview counting for "mest lest" (SPEC 7). The article page sends
 * `navigator.sendBeacon('/api/beacon', { articleId })`; the route handler
 * validates, rate-limits per ip+article per minute and calls
 * `recordPageview()`, which upserts one row per article and Oslo day.
 * No PII is stored — only a counter.
 */
import 'server-only';

import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { articleViews, articles } from '@/db/schema';
import { formatDate } from '@/lib/dates';
import { rateLimit } from '@/server/rate-limit';

export const beaconSchema = z.object({ articleId: z.uuid() });

export const BEACON_WINDOW_MS = 60_000;

/** Today's calendar date in Europe/Oslo as "YYYY-MM-DD". */
export function osloDay(now: Date = new Date()): string {
  return formatDate(now, 'iso-date');
}

/** One hit per ip+article per minute; `ok: false` when the beacon should be ignored. */
export function beaconAllowed(ip: string, articleId: string, now: number = Date.now()): boolean {
  return rateLimit(`beacon:${ip}:${articleId}`, { limit: 1, windowMs: BEACON_WINDOW_MS }, now).ok;
}

/**
 * Increment the day counter for a published article of the site. Returns
 * false when the article is unknown or not publicly visible (nothing is
 * written), true when a view was counted.
 */
export async function recordPageview(
  siteId: string,
  articleId: string,
  day: string = osloDay(),
): Promise<boolean> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.siteId, siteId),
        eq(articles.id, articleId),
        eq(articles.status, 'published'),
        lte(articles.publishedAt, sql`now()`),
        isNull(articles.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return false;
  await db
    .insert(articleViews)
    .values({ articleId, day, views: 1 })
    .onConflictDoUpdate({
      target: [articleViews.articleId, articleViews.day],
      set: { views: sql`${articleViews.views} + 1` },
    });
  return true;
}
