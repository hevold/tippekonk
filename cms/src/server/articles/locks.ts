/**
 * Soft edit locks (SPEC 5.5): opening the editor acquires a lock, the client
 * heartbeats every 30 s, and a lock without a heartbeat for 90 s is stale
 * and may be taken over. Editors with `article:edit_any` may also take over
 * a fresh lock explicitly ("Overta") — someone left with the tab open.
 *
 *   acquireLock(ctx, id)                → { ok: true } | { ok: false, lockedBy, lockedAt }
 *   heartbeatLock(ctx, id)              → refreshes the timestamp when the lock is mine
 *   releaseLock(ctx, id)                → clears the lock when it is mine
 *   lockState(ctx, article, now)        → what the UI shows
 */
import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { articles, users, type Article } from '@/db/schema';
import { NotFoundError } from '@/server/actions';
import type { AdminContext } from '@/server/auth/context';

export const LOCK_STALE_MS = 90_000;
export const LOCK_HEARTBEAT_MS = 30_000;

export type LockHolder = { id: string; name: string };

export type LockState = {
  lockedBy: LockHolder | null;
  lockedAt: Date | null;
  /** Held by the current user. */
  mine: boolean;
  /** Held by someone else but without a heartbeat for LOCK_STALE_MS. */
  stale: boolean;
  /** Whether the current user may take over a lock held by someone else right now. */
  canTakeOver: boolean;
};

export type AcquireResult = { ok: true } | { ok: false; lockedBy: LockHolder; lockedAt: Date };

type LockRow = Pick<Article, 'id' | 'lockedBy' | 'lockedAt'>;

export function isLockStale(lockedAt: Date | null, now: Date = new Date()): boolean {
  if (!lockedAt) return true;
  return now.getTime() - lockedAt.getTime() > LOCK_STALE_MS;
}

async function loadLockRow(ctx: AdminContext, id: string): Promise<LockRow> {
  const [row] = await db
    .select({ id: articles.id, lockedBy: articles.lockedBy, lockedAt: articles.lockedAt })
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.siteId, ctx.site.id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke saken.');
  return row;
}

async function holderName(userId: string): Promise<string> {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name ?? 'Ukjent bruker';
}

/** Resolve the lock state for an already-loaded article row. */
export async function lockState(
  ctx: Pick<AdminContext, 'user' | 'can'>,
  row: Pick<Article, 'lockedBy' | 'lockedAt'>,
  now: Date = new Date(),
): Promise<LockState> {
  if (!row.lockedBy) {
    return { lockedBy: null, lockedAt: null, mine: false, stale: false, canTakeOver: false };
  }
  const mine = row.lockedBy === ctx.user.id;
  const stale = !mine && isLockStale(row.lockedAt, now);
  return {
    lockedBy: { id: row.lockedBy, name: mine ? ctx.user.name : await holderName(row.lockedBy) },
    lockedAt: row.lockedAt,
    mine,
    stale,
    canTakeOver: !mine && (stale || ctx.can('article:edit_any')),
  };
}

/**
 * Try to take the lock. Succeeds when the article is unlocked, already mine
 * or the holder's lock is stale. With `takeover`, users holding
 * `article:edit_any` may also take a fresh lock from someone else.
 */
export async function acquireLock(
  ctx: AdminContext,
  id: string,
  opts: { takeover?: boolean; now?: Date } = {},
): Promise<AcquireResult> {
  const now = opts.now ?? new Date();
  const row = await loadLockRow(ctx, id);
  const heldByOther = row.lockedBy !== null && row.lockedBy !== ctx.user.id;
  if (heldByOther && !isLockStale(row.lockedAt, now)) {
    const mayTakeOver = opts.takeover === true && ctx.can('article:edit_any');
    if (!mayTakeOver) {
      return {
        ok: false,
        lockedBy: { id: row.lockedBy!, name: await holderName(row.lockedBy!) },
        lockedAt: row.lockedAt ?? now,
      };
    }
  }
  // Conditional update so two simultaneous openers cannot both win: the row
  // must still be in the state we just observed.
  const updated = await db
    .update(articles)
    .set({ lockedBy: ctx.user.id, lockedAt: now })
    .where(
      and(
        eq(articles.id, id),
        eq(articles.siteId, ctx.site.id),
        row.lockedBy === null ? isNull(articles.lockedBy) : eq(articles.lockedBy, row.lockedBy),
      ),
    )
    .returning({ id: articles.id });
  if (updated.length === 0) {
    // Someone else grabbed it between our read and write; report the current holder.
    const fresh = await loadLockRow(ctx, id);
    if (fresh.lockedBy && fresh.lockedBy !== ctx.user.id) {
      return {
        ok: false,
        lockedBy: { id: fresh.lockedBy, name: await holderName(fresh.lockedBy) },
        lockedAt: fresh.lockedAt ?? now,
      };
    }
  }
  return { ok: true };
}

/** Refresh my lock's timestamp. Returns the resulting state (not mine when someone else holds it). */
export async function heartbeatLock(ctx: AdminContext, id: string, now: Date = new Date()): Promise<LockState> {
  const row = await loadLockRow(ctx, id);
  if (row.lockedBy === ctx.user.id) {
    await db
      .update(articles)
      .set({ lockedAt: now })
      .where(and(eq(articles.id, id), eq(articles.lockedBy, ctx.user.id)));
    return lockState(ctx, { lockedBy: ctx.user.id, lockedAt: now }, now);
  }
  return lockState(ctx, row, now);
}

/** Release my lock (no-op when someone else holds it). */
export async function releaseLock(ctx: AdminContext, id: string): Promise<void> {
  await db
    .update(articles)
    .set({ lockedBy: null, lockedAt: null })
    .where(and(eq(articles.id, id), eq(articles.siteId, ctx.site.id), eq(articles.lockedBy, ctx.user.id)));
}

/** Current lock state for an article id (loads the row). */
export async function getLockState(ctx: AdminContext, id: string, now: Date = new Date()): Promise<LockState> {
  const row = await loadLockRow(ctx, id);
  return lockState(ctx, row, now);
}
