/** Per-section sitemap part, referenced from the sitemap index of large sites. */
import { sitemapResponse } from '@/server/public/handlers';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ section: string }> }) {
  const { section } = await ctx.params;
  return sitemapResponse({ sectionSlug: section });
}
