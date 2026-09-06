'use client';
/**
 * useLock — holds the article edit lock while the editor is open: acquire on
 * mount, heartbeat every 30 s, release on unmount / tab close (keepalive).
 * When someone else holds the lock the editor is read-only and the host
 * shows <LockBanner> with "Overta" / "Prøv igjen".
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { LockState } from '@/server/articles/locks';

export const LOCK_HEARTBEAT_MS = 30_000;

export type ClientLockState = Omit<LockState, 'lockedAt'> & { lockedAt: Date | null };

type LockResponse = { ok: boolean; lock: Omit<LockState, 'lockedAt'> & { lockedAt: string | null } };

function normalize(lock: LockResponse['lock']): ClientLockState {
  return { ...lock, lockedAt: lock.lockedAt ? new Date(lock.lockedAt) : null };
}

export type UseLockOptions = {
  articleId: string;
  initial: ClientLockState;
  /** The user may edit at all (permission + not trashed). */
  enabled: boolean;
  /** Called when the lock is lost to someone else while editing. */
  onLost?: (lock: ClientLockState) => void;
};

export type UseLock = {
  lock: ClientLockState;
  /** True while this user holds the lock. */
  mine: boolean;
  /** The user released the lock on purpose (via the menu). */
  released: boolean;
  busy: boolean;
  acquire: (takeover?: boolean) => Promise<boolean>;
  release: () => Promise<void>;
};

async function post(articleId: string, body: Record<string, unknown>, keepalive = false): Promise<LockResponse | null> {
  try {
    const res = await fetch(`/api/articles/${articleId}/lock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      keepalive,
    });
    if (!res.ok) return null;
    return (await res.json()) as LockResponse;
  } catch {
    return null;
  }
}

export function useLock({ articleId, initial, enabled, onLost }: UseLockOptions): UseLock {
  const [lock, setLock] = useState<ClientLockState>(initial);
  const [released, setReleased] = useState(false);
  const [busy, setBusy] = useState(false);
  const mineRef = useRef(initial.mine);
  const releasedRef = useRef(false);
  const onLostRef = useRef(onLost);
  useEffect(() => {
    onLostRef.current = onLost;
  });

  const apply = useCallback((next: ClientLockState) => {
    const wasMine = mineRef.current;
    mineRef.current = next.mine;
    setLock(next);
    if (wasMine && !next.mine && !releasedRef.current) onLostRef.current?.(next);
  }, []);

  const acquire = useCallback(
    async (takeover = false): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await post(articleId, { action: 'acquire', takeover });
        if (!res) return false;
        releasedRef.current = false;
        setReleased(false);
        apply(normalize(res.lock));
        return res.ok;
      } finally {
        setBusy(false);
      }
    },
    [articleId, apply],
  );

  const release = useCallback(async () => {
    releasedRef.current = true;
    setReleased(true);
    mineRef.current = false;
    const res = await post(articleId, { action: 'release' });
    if (res) setLock(normalize(res.lock));
    else setLock((prev) => ({ ...prev, lockedBy: null, lockedAt: null, mine: false, stale: false, canTakeOver: false }));
  }, [articleId]);

  // Acquire on mount when the lock is free, ours, or stale.
  useEffect(() => {
    if (!enabled) return;
    const canAuto = initial.mine || !initial.lockedBy || initial.stale;
    // Deferred so the state updates happen outside the effect body.
    if (canAuto) void Promise.resolve().then(() => acquire(false));
    // Only on mount: the initial state comes from the server render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, enabled]);

  // Heartbeat while we hold the lock.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (!mineRef.current || releasedRef.current) return;
      void post(articleId, { action: 'heartbeat' }).then((res) => {
        if (res) apply(normalize(res.lock));
      });
    }, LOCK_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [articleId, enabled, apply]);

  // Release on unmount and when the tab is closed.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (mineRef.current && !releasedRef.current) void post(articleId, { action: 'release' }, true);
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [articleId, enabled]);

  return { lock, mine: lock.mine, released, busy, acquire, release };
}
