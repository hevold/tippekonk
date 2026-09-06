/**
 * POST /api/beacon { articleId } — pageview counter (SPEC 7). Called with
 * navigator.sendBeacon from the article page. Validates the body,
 * rate-limits one hit per ip+article per minute (in memory), upserts the
 * per-day counter and always answers 204 so nothing about the article set
 * leaks through status codes. Malformed or unknown input is ignored.
 */
import { env } from '@/env';
import { beaconAllowed, beaconSchema, recordPageview } from '@/server/public/beacon';
import { getPublicSite } from '@/server/sites';

export const dynamic = 'force-dynamic';

const NO_CONTENT = { status: 204, headers: { 'Cache-Control': 'no-store' } } as const;
const MAX_BODY_BYTES = 1024;

function clientIp(request: Request): string {
  const forwarded = env.TRUST_PROXY ? request.headers.get('x-forwarded-for') : null;
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first.slice(0, 64);
  const real = env.TRUST_PROXY ? request.headers.get('x-real-ip') : null;
  return real?.trim().slice(0, 64) || 'local';
}

async function parseBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text || text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    // sendBeacon may post form-encoded data from older browsers.
    const params = new URLSearchParams(text);
    return params.has('articleId') ? { articleId: params.get('articleId') } : null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = beaconSchema.safeParse(await parseBody(request));
    if (!parsed.success) return new Response(null, NO_CONTENT);
    const { articleId } = parsed.data;
    if (!beaconAllowed(clientIp(request), articleId)) return new Response(null, NO_CONTENT);
    const { site } = await getPublicSite();
    await recordPageview(site.id, articleId);
  } catch (err) {
    console.error('[public] beacon', err);
  }
  return new Response(null, NO_CONTENT);
}
