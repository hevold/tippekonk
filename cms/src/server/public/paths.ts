/**
 * Pure URL helpers shared by the feed, sitemap and JSON-LD builders (no
 * Next.js imports so unit tests can load them directly).
 */

/** Join a base URL and a root-relative path; absolute URLs pass through unchanged. */
export function absoluteUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
