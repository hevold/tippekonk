/**
 * Shared plumbing for the public JSON API (/api/v1, SPEC 4.9).
 *
 *   export const GET = apiHandler(async ({ site, url }) => ({ data, meta }));
 *   export const OPTIONS = apiOptions;
 *
 * Every request authenticates with `Authorization: Bearer <key>` through
 * `requireApiKey()` (scope `content:read`). Responses are
 * `{ data, meta }` with `Cache-Control: private, max-age=30` and permissive
 * CORS for GET; errors are `{ error: { code, message } }` with a matching
 * HTTP status. Query strings are parsed with Zod (`parseQuery`).
 */
import 'server-only';

import { ZodError, type ZodType } from 'zod';
import { z } from 'zod';

import type { ApiKey, Site } from '@/db/schema';
import { env } from '@/env';
import { ActionError } from '@/server/actions';
import { requireApiKey } from '@/server/auth/guards';
import { normalizeHost } from '@/server/sites';

export const API_SCOPE = 'content:read';
export const API_CACHE_CONTROL = 'private, max-age=30';
export const API_MAX_PER_PAGE = 100;
export const API_DEFAULT_PER_PAGE = 20;

export type ApiContext<P = Record<string, string>> = {
  site: Site;
  apiKey: ApiKey;
  request: Request;
  url: URL;
  params: P;
  /** Absolute origin for links, e.g. "https://www.elvebyen.no". */
  baseUrl: string;
};

export type ApiResult = { data: unknown; meta?: Record<string, unknown>; status?: number };

export type ApiErrorCode =
  'unauthorized' | 'forbidden' | 'not_found' | 'bad_request' | 'validation' | 'rate_limited' | 'internal';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function baseHeaders(extra: Record<string, string> = {}): Headers {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra });
  return h;
}

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders({ 'Cache-Control': API_CACHE_CONTROL, ...extra }),
  });
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(details !== undefined ? { details } : {}) } }),
    {
      status,
      headers: baseHeaders({ 'Cache-Control': 'no-store' }),
    },
  );
}

const ACTION_STATUS: Record<string, { status: number; code: ApiErrorCode }> = {
  unauthorized: { status: 401, code: 'unauthorized' },
  forbidden: { status: 403, code: 'forbidden' },
  not_found: { status: 404, code: 'not_found' },
  validation: { status: 400, code: 'validation' },
  conflict: { status: 409, code: 'bad_request' },
  rate_limited: { status: 429, code: 'rate_limited' },
  internal: { status: 500, code: 'internal' },
};

/** Map any thrown value to an API error response. */
export function toErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) return errorResponse(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return errorResponse(
      400,
      'validation',
      'Ugyldige parametre.',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  if (err instanceof ActionError) {
    const mapped = ACTION_STATUS[err.code] ?? ACTION_STATUS.internal!;
    return errorResponse(mapped.status, mapped.code, err.message);
  }
  console.error('[api/v1]', err);
  return errorResponse(500, 'internal', 'Noe gikk galt.');
}

/**
 * Origin for absolute URLs in responses: the request host when it belongs to
 * the site, else the site's first real domain, else APP_URL.
 */
export function apiBaseUrl(site: Pick<Site, 'domains'>, request: Request): string {
  const forwardedHost = env.TRUST_PROXY ? request.headers.get('x-forwarded-host') : null;
  const host = forwardedHost ?? request.headers.get('host');
  const proto =
    (env.TRUST_PROXY ? request.headers.get('x-forwarded-proto') : null) ??
    new URL(request.url).protocol.replace(':', '');
  const normalized = normalizeHost(host);
  const domains = site.domains.map((d) => normalizeHost(d)).filter((d): d is string => Boolean(d));
  if (normalized && host && domains.includes(normalized)) {
    return `${proto === 'https' ? 'https' : 'http'}://${host.trim()}`;
  }
  const real = domains.find((d) => d !== 'localhost' && d !== '127.0.0.1' && !d.endsWith('.local'));
  if (real) return `https://${real}`;
  return env.APP_URL.replace(/\/+$/, '');
}

/** Parse `url.searchParams` with a Zod schema; throws ApiError(400) on failure. */
export function parseQuery<T>(schema: ZodType<T>, url: URL): T {
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (!(k in raw)) raw[k] = v;
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      400,
      'validation',
      'Ugyldige spørreparametre.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(API_MAX_PER_PAGE).default(API_DEFAULT_PER_PAGE),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginationMeta(p: PaginationQuery, total: number): Record<string, unknown> {
  return {
    page: p.page,
    perPage: p.per_page,
    total,
    pageCount: Math.max(1, Math.ceil(total / p.per_page)),
  };
}

type RouteCtx<P> = { params: Promise<P> };

/**
 * Wrap a handler: authenticate, resolve params, run, and serialise the
 * result or the error. Handlers return `{ data, meta? }`.
 */
export function apiHandler<P = Record<string, string>>(
  fn: (ctx: ApiContext<P>) => Promise<ApiResult>,
  opts: { scope?: string } = {},
): (request: Request, ctx: RouteCtx<P>) => Promise<Response> {
  return async (request, routeCtx) => {
    try {
      const { site, apiKey } = await requireApiKey(request, opts.scope ?? API_SCOPE);
      const params = await routeCtx.params;
      const url = new URL(request.url);
      const result = await fn({ site, apiKey, request, url, params, baseUrl: apiBaseUrl(site, request) });
      const meta = {
        site: { id: site.id, slug: site.slug },
        generatedAt: new Date().toISOString(),
        ...(result.meta ?? {}),
      };
      return jsonResponse({ data: result.data, meta }, result.status ?? 200);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** CORS preflight. */
export async function apiOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: new Headers(CORS_HEADERS) });
}
