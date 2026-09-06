/**
 * Scheduler: scheduled publishing, webhook delivery and housekeeping.
 *
 *   startScheduler(30_000);          // instrumentation.ts (ENABLE_INTERNAL_SCHEDULER)
 *   const summary = await tick();    // /api/cron/tick for external cron
 *
 * `tick()` is idempotent and safe on several instances at once: due
 * articles are claimed with a single `UPDATE … WHERE status = 'scheduled'
 * AND scheduled_at <= now() RETURNING`, webhook rows are leased the same way
 * (see webhooks/deliverPending), and an in-process flag prevents overlapping
 * runs within one instance.
 *
 * Scheduled publishing performs the minimal status transition here (the
 * editor area's `publishArticle` requires a signed-in AdminContext and
 * re-validates the article, which a background job cannot do): status →
 * published, publishedAt/firstPublishedAt, a `publish` revision, an audit
 * entry without a user, cache revalidation and the `article.published`
 * webhook event.
 */
import { and, eq, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';

import { db } from '@/db';
import { articleRevisions, articles, authTokens, sessions } from '@/db/schema';
import { adminPaths } from '@/config/routes';
import { canonicalPath, deskUserIds, loadRelations } from '@/server/articles/mutations';
import { AUTOSAVE_KEEP, buildSnapshot, recordRevision } from '@/server/articles/revisions';
import { audit } from '@/server/audit';
import { revalidateArticle } from '@/server/cache';
import { notify } from '@/server/notifications';
import { deliverPending, enqueueWebhookEvent, type FetchLike } from '@/server/webhooks';

export type TickSummary = {
  /** Articles published because their scheduled time had passed. */
  published: number;
  /** Webhook deliveries sent successfully. */
  webhooks: number;
  webhooksFailed: number;
  prunedRevisions: number;
  expiredSessions: number;
  expiredTokens: number;
  releasedLocks: number;
  /** true when another tick was still running in this process. */
  skipped: boolean;
  durationMs: number;
  ranAt: string;
};

/** Autosaves older than this are pruned even beyond the newest AUTOSAVE_KEEP. */
export const AUTOSAVE_MAX_AGE_DAYS = 30;
/** Locks without a heartbeat for this long are released (3× the editor's stale threshold). */
export const LOCK_RELEASE_MS = 3 * 90_000;
export const WEBHOOK_BATCH = 25;

type Options = { now?: Date; fetch?: FetchLike; webhookLimit?: number };

/* -------------------------------------------------------------------------- */
/*  Scheduled publishing                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Atomically flip every due scheduled article to published and return the
 * rows. Concurrent instances each get a disjoint set because the UPDATE
 * only matches rows still in `scheduled`.
 */
async function claimDueArticles(now: Date) {
  return db
    .update(articles)
    .set({
      status: 'published',
      publishedAt: sql`coalesce(${articles.publishedAt}, ${now})`,
      firstPublishedAt: sql`coalesce(${articles.firstPublishedAt}, ${now})`,
      scheduledAt: null,
      unpublishedAt: null,
      version: sql`${articles.version} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(articles.status, 'scheduled'),
        lte(articles.scheduledAt, now),
        sql`${articles.deletedAt} is null`,
      ),
    )
    .returning();
}

export async function publishDueArticles(now: Date = new Date()): Promise<number> {
  const rows = await claimDueArticles(now);
  for (const row of rows) {
    try {
      const relations = await loadRelations(db, row.id);
      await recordRevision(db, {
        articleId: row.id,
        version: row.version,
        snapshot: buildSnapshot(row, relations.tagIds, relations.bylines),
        kind: 'publish',
        userId: row.updatedBy ?? null,
        note: 'Publisert automatisk (planlagt)',
        now,
      });
      await audit(
        { site: { id: row.siteId }, user: null },
        {
          action: 'article.publish',
          entityType: 'article',
          entityId: row.id,
          summary: `Publiserte «${row.title || 'Uten tittel'}» automatisk (planlagt)`,
          data: { scheduled: true, version: row.version },
        },
      );
      const recipients = new Set(await deskUserIds(row.siteId));
      if (row.createdBy) recipients.add(row.createdBy);
      if (row.updatedBy) recipients.add(row.updatedBy);
      await notify([...recipients], {
        siteId: row.siteId,
        kind: 'article.published',
        title: `«${row.title || 'Uten tittel'}» er publisert`,
        body: 'Saken ble publisert automatisk på det planlagte tidspunktet.',
        link: adminPaths.article(row.id),
      });
      revalidateArticle(row.siteId, row.id);
      await enqueueWebhookEvent(row.siteId, 'article.published', {
        id: row.id,
        title: row.title,
        slug: row.slug,
        status: row.status,
        path: await canonicalPath(db, row),
        sectionId: row.sectionId,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString(),
        scheduled: true,
      });
    } catch (err) {
      // The article is already published; bookkeeping failures must not block the rest of the batch.
      console.error('[scheduler] post-publish bookkeeping failed for', row.id, err);
    }
  }
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/*  Housekeeping                                                               */
/* -------------------------------------------------------------------------- */

/** Delete autosave revisions older than 30 days that are not among an article's newest 20 autosaves. */
export async function pruneOldAutosaves(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - AUTOSAVE_MAX_AGE_DAYS * 86_400_000);
  const ranked = db
    .select({
      id: articleRevisions.id,
      rn: sql<number>`row_number() over (partition by ${articleRevisions.articleId} order by ${articleRevisions.createdAt} desc)`.as(
        'rn',
      ),
      createdAt: articleRevisions.createdAt,
    })
    .from(articleRevisions)
    .where(eq(articleRevisions.kind, 'autosave'))
    .as('ranked');
  const stale = await db
    .select({ id: ranked.id })
    .from(ranked)
    .where(and(sql`${ranked.rn} > ${AUTOSAVE_KEEP}`, lt(ranked.createdAt, cutoff)));
  if (stale.length === 0) return 0;
  const deleted = await db
    .delete(articleRevisions)
    .where(
      inArray(
        articleRevisions.id,
        stale.map((r) => r.id),
      ),
    )
    .returning({ id: articleRevisions.id });
  return deleted.length;
}

export async function deleteExpiredSessions(now: Date = new Date()): Promise<number> {
  const rows = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  return rows.length;
}

export async function deleteExpiredTokens(now: Date = new Date()): Promise<number> {
  const rows = await db
    .delete(authTokens)
    .where(lt(authTokens.expiresAt, now))
    .returning({ id: authTokens.id });
  return rows.length;
}

export async function releaseStaleLocks(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - LOCK_RELEASE_MS);
  const rows = await db
    .update(articles)
    .set({ lockedBy: null, lockedAt: null })
    .where(and(isNotNull(articles.lockedAt), lt(articles.lockedAt, cutoff)))
    .returning({ id: articles.id });
  return rows.length;
}

/* -------------------------------------------------------------------------- */
/*  Tick                                                                       */
/* -------------------------------------------------------------------------- */

const g = globalThis as unknown as {
  __deskenSchedulerRunning?: boolean;
  __deskenSchedulerTimer?: NodeJS.Timeout;
};

async function step<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[scheduler] ${name} failed`, err);
    return fallback;
  }
}

export async function tick(opts: Options = {}): Promise<TickSummary> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const base: TickSummary = {
    published: 0,
    webhooks: 0,
    webhooksFailed: 0,
    prunedRevisions: 0,
    expiredSessions: 0,
    expiredTokens: 0,
    releasedLocks: 0,
    skipped: false,
    durationMs: 0,
    ranAt: now.toISOString(),
  };
  if (g.__deskenSchedulerRunning) return { ...base, skipped: true };
  g.__deskenSchedulerRunning = true;
  try {
    const published = await step('publish', () => publishDueArticles(now), 0);
    const delivery = await step(
      'webhooks',
      () => deliverPending(opts.webhookLimit ?? WEBHOOK_BATCH, { fetch: opts.fetch, now }),
      { delivered: 0, failed: 0, claimed: 0 },
    );
    const prunedRevisions = await step('prune', () => pruneOldAutosaves(now), 0);
    const expiredSessions = await step('sessions', () => deleteExpiredSessions(now), 0);
    const expiredTokens = await step('tokens', () => deleteExpiredTokens(now), 0);
    const releasedLocks = await step('locks', () => releaseStaleLocks(now), 0);
    return {
      ...base,
      published,
      webhooks: delivery.delivered,
      webhooksFailed: delivery.failed,
      prunedRevisions,
      expiredSessions,
      expiredTokens,
      releasedLocks,
      durationMs: Date.now() - started,
    };
  } finally {
    g.__deskenSchedulerRunning = false;
  }
}

/** Start the in-process interval once per process. */
export function startScheduler(intervalMs = 30_000): void {
  if (g.__deskenSchedulerTimer) return;
  const timer = setInterval(
    () => {
      tick().catch((err) => console.error('[scheduler]', err));
    },
    Math.max(5_000, intervalMs),
  );
  timer.unref?.();
  g.__deskenSchedulerTimer = timer;
}

export function stopScheduler(): void {
  if (g.__deskenSchedulerTimer) clearInterval(g.__deskenSchedulerTimer);
  g.__deskenSchedulerTimer = undefined;
}
