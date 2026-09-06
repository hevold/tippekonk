/**
 * POST /api/articles/[id]/lock — edit-lock endpoint for the editor.
 *
 * Body: { action: 'acquire' | 'heartbeat' | 'release', takeover?: boolean }
 * 200 → { ok: boolean, lock: LockState }   (ok=false: someone else holds it)
 *
 * The client heartbeats every 30 s and releases with `keepalive` on unload;
 * a lock older than 90 s is stale (SPEC 5.5).
 */
import { z } from 'zod';

import { uuidSchema } from '@/lib/validation/common';
import { ActionError } from '@/server/actions';
import { acquireLock, getLockState, heartbeatLock, releaseLock } from '@/server/articles/locks';
import { requireAdminContext } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum(['acquire', 'heartbeat', 'release']).default('heartbeat'),
  takeover: z.boolean().default(false),
});

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!isSameOrigin(request)) return errorResponse(403, 'forbidden', 'Ugyldig opprinnelse.');
  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return errorResponse(404, 'not_found', 'Fant ikke saken.');

  let raw: unknown = {};
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, 'bad_request', 'Forventet JSON.');
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return errorResponse(400, 'bad_request', 'Ugyldig forespørsel.');

  try {
    const admin = await requireAdminContext();
    if (!admin.can('admin:access')) return errorResponse(403, 'forbidden', 'Du har ikke tilgang.');
    const articleId = parsedId.data;
    if (body.data.action === 'release') {
      await releaseLock(admin, articleId);
      const lock = await getLockState(admin, articleId);
      return Response.json({ ok: true, lock });
    }
    if (body.data.action === 'acquire') {
      const result = await acquireLock(admin, articleId, { takeover: body.data.takeover });
      const lock = await getLockState(admin, articleId);
      return Response.json({ ok: result.ok, lock });
    }
    const lock = await heartbeatLock(admin, articleId);
    return Response.json({ ok: lock.mine, lock });
  } catch (err) {
    if (err instanceof ActionError)
      return errorResponse(STATUS_BY_CODE[err.code] ?? 500, err.code, err.message);
    console.error('[articles] lock', err);
    return errorResponse(500, 'internal', 'Noe gikk galt.');
  }
}
