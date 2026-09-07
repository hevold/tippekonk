/**
 * "Has this path moved?" for public pages (SPEC 5.3): before a section or
 * article page 404s it asks the redirects table (owned by the settings area)
 * and, on a hit, throws Next's redirect.
 *
 * Status codes: a page cannot answer with an arbitrary status — Next's
 * `permanentRedirect()` is a 308 and `redirect()` a 307 — so stored 301/308
 * rules become 308 and 302/307 become 307. For the GET requests public pages
 * serve this is the same signal to browsers and crawlers (permanent vs.
 * temporary); only the method-preservation semantics differ, which is moot
 * for a page.
 */
import 'server-only';

import { permanentRedirect, redirect } from 'next/navigation';

import { resolveRedirect } from '@/server/redirects';

/** Redirect (never returns) when a rule matches `path`; otherwise returns so the caller can 404. */
export async function redirectIfMoved(siteId: string, path: string): Promise<void> {
  const hit = await resolveRedirect(siteId, path);
  if (!hit) return;
  if (hit.statusCode === 301 || hit.statusCode === 308) permanentRedirect(hit.toPath);
  redirect(hit.toPath);
}
