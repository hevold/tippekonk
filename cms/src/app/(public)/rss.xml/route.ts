/** Site-wide RSS 2.0 feed (SPEC 7). */
import { rssResponse } from '@/server/public/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  return rssResponse();
}
