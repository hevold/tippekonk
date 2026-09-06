'use client';
/**
 * Tiny pageview beacon: once per article page load, POST { articleId } to
 * /api/beacon with `navigator.sendBeacon` (falls back to a keepalive
 * fetch). Renders nothing. No cookies, no identifiers — the server only
 * increments a per-day counter (SPEC 7).
 */
import { useEffect } from 'react';

const sent = new Set<string>();

export function PageviewBeacon({ articleId }: { articleId: string }) {
  useEffect(() => {
    if (!articleId || sent.has(articleId)) return;
    sent.add(articleId);
    const body = JSON.stringify({ articleId });
    try {
      if (typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon('/api/beacon', blob)) return;
      }
      void fetch('/api/beacon', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Counting views is best-effort; never disturb the reader.
    }
  }, [articleId]);
  return null;
}
