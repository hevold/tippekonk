/**
 * Public-site cache helpers (Next.js "previous model": unstable_cache + tags).
 *
 * Public queries wrap expensive reads with `cachedPublic(fn, keyParts, { siteId, tags })`.
 * Every mutation that changes what readers see calls `revalidatePublic(siteId)`
 * (or the finer-grained helpers). Admin pages are always dynamic and never cached.
 */
import { revalidateTag, unstable_cache } from 'next/cache';

export const cacheTags = {
  site: (siteId: string) => `site:${siteId}`,
  article: (articleId: string) => `article:${articleId}`,
  section: (sectionId: string) => `section:${sectionId}`,
  layout: (siteId: string) => `layout:${siteId}`,
  live: (liveBlogId: string) => `live:${liveBlogId}`,
};

/** Default freshness for public reads, in seconds. */
export const PUBLIC_REVALIDATE_SECONDS = 60;

export function cachedPublic<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { siteId: string; tags?: string[]; revalidate?: number },
): (...args: TArgs) => Promise<TResult> {
  return unstable_cache(fn, keyParts, {
    tags: [cacheTags.site(options.siteId), ...(options.tags ?? [])],
    revalidate: options.revalidate ?? PUBLIC_REVALIDATE_SECONDS,
  });
}

/** Invalidate everything public for a site (safe default after any content change). */
export function revalidatePublic(siteId: string): void {
  try {
    revalidateTag(cacheTags.site(siteId), 'max');
  } catch {
    // Outside a Next.js request scope (scripts/tests) revalidateTag is a no-op.
  }
}

export function revalidateArticle(siteId: string, articleId: string): void {
  try {
    revalidateTag(cacheTags.article(articleId), 'max');
    revalidateTag(cacheTags.site(siteId), 'max');
  } catch {
    /* no-op outside request scope */
  }
}

export function revalidateLive(liveBlogId: string): void {
  try {
    revalidateTag(cacheTags.live(liveBlogId), 'max');
  } catch {
    /* no-op outside request scope */
  }
}
