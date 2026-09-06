/** robots.txt: points at the sitemap and keeps crawlers out of /admin and /api. */
import { robotsResponse } from '@/server/public/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return robotsResponse();
}
