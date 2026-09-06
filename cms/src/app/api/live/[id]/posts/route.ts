/**
 * GET /api/live/[id]/posts?after=<iso>&limit=n — public polling endpoint for
 * the live blog page. Returns posts created/edited after `after` (all posts
 * when omitted), ids of posts deleted since, the media they reference and
 * the blog status. No authentication; cached for 10 s so a busy live blog
 * does not hammer the database.
 */
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { liveBlogs } from '@/db/schema';
import { livePollQuerySchema } from '@/lib/validation/live';
import { uuidSchema } from '@/lib/validation/common';
import { listPostsAfter } from '@/server/live';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'public, max-age=10, s-maxage=10, stale-while-revalidate=30' };

function errorJson(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return errorJson(404, 'not_found', 'Fant ikke direktesendingen.');
  const url = new URL(request.url);
  const query = livePollQuerySchema.safeParse({
    after: url.searchParams.get('after') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!query.success) return errorJson(400, 'validation', 'Ugyldige parametre.');

  const [blog] = await db
    .select({ id: liveBlogs.id, status: liveBlogs.status })
    .from(liveBlogs)
    .where(and(eq(liveBlogs.id, parsedId.data)))
    .limit(1);
  if (!blog || blog.status === 'draft') return errorJson(404, 'not_found', 'Fant ikke direktesendingen.');

  const delta = await listPostsAfter(blog.id, query.data.after, query.data.limit);
  return Response.json(delta, { headers: HEADERS });
}
