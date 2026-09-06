/**
 * POST /api/articles/[id]/autosave — the editor's background save.
 *
 * Body: { input: ArticleInput, expectedVersion: number, kind?: 'autosave' | 'manual' }
 * 200 → { version, savedAt, slug }
 * 409 → { error: { code: 'conflict', message } }   (someone else saved; reload)
 * 400/401/403/404/422 → { error: { code, message, fieldErrors? } }
 *
 * A route handler (not a server action) so the client can inspect the HTTP
 * status and use `fetch(..., { keepalive: true })` when the tab closes.
 */
import { z } from 'zod';

import { articleInputSchema } from '@/lib/validation/article';
import { uuidSchema } from '@/lib/validation/common';
import { ActionError } from '@/server/actions';
import { loadArticle } from '@/server/articles/mutations';
import { saveArticle } from '@/server/articles/service';
import { requireAdminContext } from '@/server/auth/guards';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  input: z.unknown(),
  expectedVersion: z.coerce.number().int().min(1),
  kind: z.enum(['autosave', 'manual']).default('autosave'),
});

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({ error: { code, message, ...extra } }, { status });
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
  if (!isSameOrigin(request)) return errorResponse(403, 'forbidden', 'Lagring må skje fra samme nettsted.');
  const { id } = await ctx.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return errorResponse(404, 'not_found', 'Fant ikke saken.');

  // Authenticate before touching the body so anonymous callers learn nothing about validation.
  let admin;
  try {
    admin = await requireAdminContext();
  } catch (err) {
    if (err instanceof ActionError)
      return errorResponse(STATUS_BY_CODE[err.code] ?? 500, err.code, err.message);
    throw err;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(400, 'bad_request', 'Forventet JSON.');
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) return errorResponse(400, 'bad_request', 'Ugyldig forespørsel.');
  const input = articleInputSchema.safeParse(body.data.input);
  if (!input.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of input.error.issues) {
      const key = issue.path.length ? issue.path.map(String).join('.') : '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return errorResponse(422, 'validation', 'Sjekk feltene og prøv igjen.', { fieldErrors });
  }

  try {
    const result = await saveArticle(admin, parsedId.data, input.data, {
      expectedVersion: body.data.expectedVersion,
      kind: body.data.kind,
    });
    return Response.json({
      version: result.version,
      savedAt: result.article.updatedAt.toISOString(),
      slug: result.article.slug,
    });
  } catch (err) {
    if (err instanceof ActionError) {
      const extra: Record<string, unknown> = err.fieldErrors ? { fieldErrors: err.fieldErrors } : {};
      if (err.code === 'conflict') {
        // Let the client offer "overskriv": it needs the version to send next.
        const current = await loadArticle(admin.site.id, parsedId.data).catch(() => null);
        if (current) extra.currentVersion = current.version;
      }
      return errorResponse(STATUS_BY_CODE[err.code] ?? 500, err.code, err.message, extra);
    }
    console.error('[articles] autosave', err);
    return errorResponse(500, 'internal', 'Noe gikk galt under lagringen. Prøv igjen.');
  }
}
