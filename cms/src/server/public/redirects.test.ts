import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { redirects } from '@/db/schema';
import type { Db } from '@/db';
import { seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { findRedirect, normalizeRedirectPath } from './redirects';

let db: Db;
let seeded: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
  seeded = await seedMinimal(db);
  await db.insert(redirects).values([
    { siteId: seeded.site.id, fromPath: '/nyheter/gammel-slug', toPath: '/nyheter/ny-slug', statusCode: 301 },
    { siteId: seeded.site.id, fromPath: '/kampanje', toPath: '/sport/kampanje', statusCode: 302 },
    { siteId: seeded.site.id, fromPath: '/loop', toPath: '/loop/', statusCode: 301 },
  ]);
});

describe('normalizeRedirectPath', () => {
  it('strips query, hash and trailing slashes, decodes and keeps the leading slash', () => {
    expect(normalizeRedirectPath('/nyheter/x/?a=1#h')).toBe('/nyheter/x');
    expect(normalizeRedirectPath('nyheter/x')).toBe('/nyheter/x');
    expect(normalizeRedirectPath('/')).toBe('/');
    expect(normalizeRedirectPath('/s%C3%B8k')).toBe('/søk');
    expect(normalizeRedirectPath('/%E0%A4%A')).toBe('/%E0%A4%A');
  });
});

describe('findRedirect', () => {
  it('finds exact matches per site, counts hits and preserves the status code', async () => {
    const hit = await findRedirect(seeded.site.id, '/nyheter/gammel-slug/');
    expect(hit).toEqual({ toPath: '/nyheter/ny-slug', statusCode: 301 });
    expect(await findRedirect(seeded.site.id, '/kampanje')).toEqual({
      toPath: '/sport/kampanje',
      statusCode: 302,
    });
    expect(await findRedirect(seeded.site.id, '/finnes-ikke')).toBeNull();
    expect(await findRedirect('00000000-0000-0000-0000-000000000000', '/kampanje')).toBeNull();
    // the hit counter is updated asynchronously; give it a tick
    await new Promise((r) => setTimeout(r, 50));
    const [row] = await db.select().from(redirects).where(eq(redirects.fromPath, '/nyheter/gammel-slug'));
    expect(row?.hits).toBe(1);
  });

  it('never redirects a path onto itself', async () => {
    expect(await findRedirect(seeded.site.id, '/loop')).toBeNull();
  });
});
