import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { Db } from '@/db';
import { type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { createApiKey } from '@/server/api-keys';

import {
  apiBaseUrl,
  apiHandler,
  apiOptions,
  ApiError,
  paginationMeta,
  paginationQuerySchema,
  parseQuery,
} from './handler';

let db: Db;
let seed: SeedMinimalResult;
let rawKey: string;

function ctxFor(user: User, role: MemberRole): AdminContext {
  return {
    user,
    site: seed.site,
    settings: parseSiteSettings(seed.site.settings),
    role,
    sites: [seed.site],
    locale: 'nb',
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip: null,
    sessionId: 'test-session',
  };
}

const params = { params: Promise.resolve({}) };

function request(path: string, key: string | null = rawKey): Request {
  return new Request(`http://localhost:3000${path}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
  rawKey = (await createApiKey(ctxFor(seed.admin, 'admin'), { name: 'test' })).raw;
});

describe('api handler', () => {
  it('rejects missing and invalid keys with a JSON error envelope', async () => {
    const handler = apiHandler(async () => ({ data: 1 }));
    const missing = await handler(request('/api/v1/site', null), params);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: { code: 'unauthorized', message: 'Mangler API-nøkkel.' } });
    expect(missing.headers.get('access-control-allow-origin')).toBe('*');
    const wrong = await handler(request('/api/v1/site', 'dsk_nope'), params);
    expect(wrong.status).toBe(401);
  });

  it('wraps results in { data, meta } with cache and CORS headers', async () => {
    const handler = apiHandler(async ({ site, baseUrl, url }) => ({
      data: { site: site.slug, baseUrl, q: url.searchParams.get('q') },
      meta: { extra: true },
    }));
    const res = await handler(request('/api/v1/site?q=hei'), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=30');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res.json()) as {
      data: { site: string; baseUrl: string; q: string };
      meta: { extra: boolean; site: { slug: string } };
    };
    expect(body.data).toEqual({ site: 'test', baseUrl: 'http://localhost:3000', q: 'hei' });
    expect(body.meta.extra).toBe(true);
    expect(body.meta.site.slug).toBe('test');
  });

  it('maps thrown errors to statuses', async () => {
    const notFound = apiHandler(async () => {
      throw new ApiError(404, 'not_found', 'Borte');
    });
    const res = await notFound(request('/api/v1/x'), params);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Borte' } });

    const invalid = apiHandler(async ({ url }) => ({
      data: parseQuery(paginationQuerySchema.extend({ since: z.coerce.date() }), url),
    }));
    const bad = await invalid(request('/api/v1/x?page=0&since=nope'), params);
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe('validation');
    expect(body.error.details.length).toBeGreaterThan(0);

    const crash = apiHandler(async () => {
      throw new Error('boom');
    });
    expect((await crash(request('/api/v1/x'), params)).status).toBe(500);
  });

  it('parses pagination with defaults and rejects out-of-range values', () => {
    expect(parseQuery(paginationQuerySchema, new URL('http://x/y'))).toEqual({ page: 1, per_page: 20 });
    expect(parseQuery(paginationQuerySchema, new URL('http://x/y?page=3&per_page=50'))).toEqual({
      page: 3,
      per_page: 50,
    });
    expect(() => parseQuery(paginationQuerySchema, new URL('http://x/y?per_page=500'))).toThrow(ApiError);
  });

  it('answers preflight and builds the base url', async () => {
    const res = await apiOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(apiBaseUrl({ domains: ['localhost'] }, request('/api/v1/site'))).toBe('http://localhost:3000');
    expect(apiBaseUrl({ domains: ['www.avis.no'] }, new Request('http://other.example/api'))).toBe(
      'https://www.avis.no',
    );
    expect(paginationMeta({ page: 2, per_page: 10 }, 35)).toEqual({
      page: 2,
      perPage: 10,
      total: 35,
      pageCount: 4,
    });
  });
});
