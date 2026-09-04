/**
 * Liveness/readiness probe used by Docker HEALTHCHECK and load balancers.
 * Returns 200 when the database answers, 503 otherwise. Never leaks details.
 */
import { sql } from 'drizzle-orm';

import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
