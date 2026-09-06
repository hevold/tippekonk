/**
 * POST|GET /api/cron/tick — external scheduler entry point. Protects itself
 * with `Authorization: Bearer <CRON_SECRET>`; answers 503 when no secret is
 * configured (so an unprotected endpoint never exists by accident) and 403
 * on a wrong secret. Returns the tick summary.
 */
import { timingSafeEqual } from 'node:crypto';

import { env } from '@/env';
import { bearerToken } from '@/server/auth/guards';
import { tick } from '@/server/scheduler';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  if (!env.CRON_SECRET) {
    return Response.json(
      {
        error: {
          code: 'unavailable',
          message: 'CRON_SECRET er ikke satt; ekstern planlegger er deaktivert.',
        },
      },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!secretMatches(bearerToken(request), env.CRON_SECRET)) {
    return Response.json(
      { error: { code: 'forbidden', message: 'Ugyldig hemmelighet.' } },
      { status: 403, headers: NO_STORE },
    );
  }
  const summary = await tick();
  return Response.json({ data: summary }, { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}
