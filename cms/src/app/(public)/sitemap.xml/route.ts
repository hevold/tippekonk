/**
 * sitemap.xml (SPEC 7): one urlset for small sites, a sitemap index above
 * 2000 articles (`?del=base` renders the base part of a split sitemap).
 */
import { sitemapResponse } from '@/server/public/handlers';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const part = new URL(request.url).searchParams.get('del');
  return sitemapResponse({ part });
}
