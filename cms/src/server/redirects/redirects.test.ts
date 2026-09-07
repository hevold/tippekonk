/**
 * Redirects: path normalisation, loop detection (pure), uniqueness, resolve
 * with hit counting, CSV parsing and import.
 */
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { redirects } from '@/db/schema';
import type { Permission } from '@/lib/permissions';
import { ConflictError, ForbiddenError } from '@/server/actions';
import { testContext } from '@/server/settings/test-helpers';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
}));

import {
  createRedirect,
  createsLoop,
  deleteRedirect,
  importRedirects,
  listRedirects,
  lookupRedirect,
  normalizeRedirectPath,
  parseRedirectCsv,
  redirectInputSchema,
  resolveRedirect,
  updateRedirect,
} from './index';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('normalizeRedirectPath / redirectInputSchema', () => {
  it('normalises paths', () => {
    expect(normalizeRedirectPath('/nyheter/x/?a=1#h')).toBe('/nyheter/x');
    expect(normalizeRedirectPath('nyheter//x/')).toBe('/nyheter/x');
    expect(normalizeRedirectPath('/s%C3%B8k')).toBe('/søk');
    expect(normalizeRedirectPath('/')).toBe('/');
  });
  it('validates from/to and status code', () => {
    expect(redirectInputSchema.parse({ fromPath: '/gammel/', toPath: '/ny' })).toEqual({
      fromPath: '/gammel',
      toPath: '/ny',
      statusCode: 301,
    });
    expect(redirectInputSchema.safeParse({ fromPath: 'gammel', toPath: '/ny' }).success).toBe(false);
    expect(redirectInputSchema.safeParse({ fromPath: '/', toPath: '/ny' }).success).toBe(false);
    expect(redirectInputSchema.safeParse({ fromPath: '/admin/x', toPath: '/ny' }).success).toBe(false);
    expect(redirectInputSchema.safeParse({ fromPath: '/a', toPath: '/a/' }).success).toBe(false);
    expect(redirectInputSchema.safeParse({ fromPath: '/a', toPath: '/b', statusCode: 303 }).success).toBe(
      false,
    );
    expect(
      redirectInputSchema.parse({ fromPath: '/a', toPath: 'https://example.com/x', statusCode: '302' }),
    ).toMatchObject({
      toPath: 'https://example.com/x',
      statusCode: 302,
    });
    expect(redirectInputSchema.safeParse({ fromPath: '/a', toPath: 'ftp://x' }).success).toBe(false);
  });
});

describe('createsLoop', () => {
  it('detects direct and indirect loops', () => {
    const existing = [
      { id: '1', fromPath: '/b', toPath: '/c' },
      { id: '2', fromPath: '/c', toPath: '/d' },
    ];
    expect(createsLoop('/a', '/b', existing)).toBe(false);
    expect(createsLoop('/d', '/b', existing)).toBe(true);
    expect(createsLoop('/a', '/a', [])).toBe(true);
    expect(createsLoop('/d', 'https://example.com', existing)).toBe(false);
    // editing row 1 to point at /a while /a -> /b: loop unless row 1 is excluded
    expect(createsLoop('/a', '/b', [...existing, { id: '9', fromPath: '/d', toPath: '/a' }])).toBe(true);
    expect(createsLoop('/a', '/b', [...existing, { id: '9', fromPath: '/d', toPath: '/a' }], '9')).toBe(
      false,
    );
  });
});

describe('redirect service', () => {
  it('creates, enforces uniqueness and loops, resolves with hits, updates and deletes', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const created = await createRedirect(ctx, {
      fromPath: '/gammel',
      toPath: '/nyheter/ny',
      statusCode: 302,
    });
    expect(created.fromPath).toBe('/gammel');

    await expect(createRedirect(ctx, { fromPath: '/gammel/', toPath: '/x' })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(createRedirect(ctx, { fromPath: '/nyheter/ny', toPath: '/gammel' })).rejects.toThrowError(
      /løkke/,
    );

    expect(await resolveRedirect(seed.site.id, '/gammel/?utm=1')).toEqual({
      toPath: '/nyheter/ny',
      statusCode: 302,
    });
    expect(await resolveRedirect(seed.site.id, '/finnes-ikke')).toBeNull();
    expect(await resolveRedirect('00000000-0000-0000-0000-000000000000', '/gammel')).toBeNull();
    await sleep(50);
    const [row] = await db.select().from(redirects).where(eq(redirects.id, created.id));
    expect(row?.hits).toBe(1);

    const lookup = await lookupRedirect(seed.site.id, '/gammel');
    expect(lookup.matched?.id).toBe(created.id);
    expect(lookup.finalPath).toBe('/nyheter/ny');
    expect(lookup.loops).toBe(false);
    // hits are not counted by lookups
    const [after] = await db.select().from(redirects).where(eq(redirects.id, created.id));
    expect(after?.hits).toBe(1);

    const updated = await updateRedirect(ctx, created.id, {
      fromPath: '/gammel',
      toPath: '/sport',
      statusCode: 301,
    });
    expect(updated.toPath).toBe('/sport');

    const page = await listRedirects(seed.site.id, { q: 'sport' });
    expect(page.total).toBe(1);

    await deleteRedirect(ctx, created.id);
    expect((await listRedirects(seed.site.id)).total).toBe(0);
  });

  it('forbids editors', async () => {
    const ctx = testContext(seed.editor, seed.site, 'editor');
    await expect(createRedirect(ctx, { fromPath: '/a', toPath: '/b' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe('CSV import', () => {
  it('parses separators, headers, comments and reports bad lines', () => {
    const { rows, issues } = parseRedirectCsv(
      [
        'from,to,status',
        '# comment',
        '/a;/b;302',
        '/c\t/d',
        'bad',
        '/e,/e',
        '',
        '/f,https://example.com/x',
      ].join('\n'),
    );
    expect(rows.map((r) => [r.fromPath, r.toPath, r.statusCode])).toEqual([
      ['/a', '/b', 302],
      ['/c', '/d', 301],
      ['/f', 'https://example.com/x', 301],
    ]);
    expect(issues.map((i) => i.line)).toEqual([5, 6]);
  });

  it('imports new rows, updates existing ones and skips loops and duplicates', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await createRedirect(ctx, { fromPath: '/a', toPath: '/b' });
    const result = await importRedirects(ctx, ['/a,/c', '/c,/a', '/d,/e', '/d,/f'].join('\n'));
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.issues).toHaveLength(2);
    const all = await listRedirects(seed.site.id, { sort: 'from' });
    expect(all.items.map((r) => [r.fromPath, r.toPath])).toEqual([
      ['/a', '/c'],
      ['/d', '/e'],
    ]);
  });
});
