/** Per-section RSS 2.0 feed (SPEC 7). */
import { rssResponse } from '@/server/public/handlers';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ section: string }> }) {
  const { section } = await ctx.params;
  return rssResponse(section);
}
