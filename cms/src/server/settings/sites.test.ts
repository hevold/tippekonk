/**
 * Multi-site management: creating a site with defaults, editing, the last
 * active site guard, and slug-confirmed deletion.
 */
import { desc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { auditLog, contentTypes, layouts, memberships, menus, sections, sites } from '@/db/schema';
import type { Permission } from '@/lib/permissions';
import { ForbiddenError } from '@/server/actions';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
}));

import { createSite, deleteSite, listSitesForAdmin, setSiteActive, updateSite } from './sites-service';
import { testContext } from './test-helpers';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('createSite', () => {
  it('creates the site with content types, a Nyheter section, menus, a layout and the creator as admin', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const site = await createSite(ctx, {
      name: 'Fjordbladet',
      slug: 'fjordbladet',
      domains: ['fjordbladet.no', 'www.fjordbladet.no'],
      locale: 'nn',
    });
    expect(site.isActive).toBe(true);
    expect(site.locale).toBe('nn');

    const types = await db.select().from(contentTypes).where(eq(contentTypes.siteId, site.id));
    expect(types.map((t) => t.key).sort()).toEqual(['article', 'notice', 'opinion']);
    expect(types.filter((t) => t.isDefault).map((t) => t.key)).toEqual(['article']);

    const secs = await db.select().from(sections).where(eq(sections.siteId, site.id));
    expect(secs.map((s) => s.slug)).toEqual(['nyheter']);

    const menuRows = await db.select().from(menus).where(eq(menus.siteId, site.id));
    expect(menuRows.map((m) => m.key).sort()).toEqual(['footer', 'primary', 'topbar']);
    expect(menuRows.find((m) => m.key === 'primary')?.items).toEqual([
      { id: 'nyheter', label: 'Nyheter', href: '/nyheter' },
    ]);

    const [layout] = await db.select().from(layouts).where(eq(layouts.siteId, site.id));
    expect(layout?.key).toBe('front');
    expect(layout?.published).toBeNull();
    expect(layout?.draft.rows.length).toBeGreaterThan(0);

    const [member] = await db.select().from(memberships).where(eq(memberships.siteId, site.id));
    expect(member).toMatchObject({ userId: seed.admin.id, role: 'admin' });

    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(entry?.action).toBe('site.create');
    expect(entry?.siteId).toBe(site.id);

    const list = await listSitesForAdmin();
    expect(list.map((s) => s.slug)).toEqual(['test', 'fjordbladet']);
    expect(list[1]?.members).toBe(1);
  });

  it('rejects duplicate slugs, reserved slugs, taken domains and non-superadmins', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await expect(createSite(ctx, { name: 'X', slug: 'test' })).rejects.toThrowError(/allerede i bruk/);
    await expect(createSite(ctx, { name: 'X', slug: 'admin' })).rejects.toThrowError();
    await expect(createSite(ctx, { name: 'X', slug: 'x', domains: ['localhost'] })).rejects.toThrowError(
      /brukes allerede/,
    );
    const editor = testContext(seed.editor, seed.site, 'editor');
    await expect(createSite(editor, { name: 'X', slug: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    // nothing half-created
    const rows = await db.select().from(sites);
    expect(rows).toHaveLength(1);
  });
});

describe('updateSite / setSiteActive / deleteSite', () => {
  it('edits general columns and guards the last active site', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const updated = await updateSite(ctx, seed.site.id, {
      name: 'Testavisen 2',
      tagline: 'Ny tagline',
      domains: ['test.no'],
      locale: 'nb',
      timezone: 'Europe/Oslo',
      isActive: true,
    });
    expect(updated.name).toBe('Testavisen 2');
    await expect(setSiteActive(ctx, seed.site.id, false)).rejects.toThrowError(/eneste aktive/);

    const other = await createSite(ctx, { name: 'Andre', slug: 'andre' });
    const deactivated = await setSiteActive(ctx, other.id, false);
    expect(deactivated.isActive).toBe(false);
    const reactivated = await setSiteActive(ctx, other.id, true);
    expect(reactivated.isActive).toBe(true);
  });

  it('deletes only when the slug is typed and never the last site', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await expect(deleteSite(ctx, { id: seed.site.id, confirmSlug: 'test' })).rejects.toThrowError(
      /eneste nettstedet/,
    );
    const other = await createSite(ctx, { name: 'Andre', slug: 'andre' });
    await expect(deleteSite(ctx, { id: other.id, confirmSlug: 'feil' })).rejects.toThrowError(/stemmer ikke/);
    const result = await deleteSite(ctx, { id: other.id, confirmSlug: 'ANDRE' });
    expect(result.slug).toBe('andre');
    expect(await db.select().from(sites).where(eq(sites.id, other.id))).toHaveLength(0);
    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(entry?.action).toBe('site.delete');
    expect(entry?.siteId).toBeNull();
  });
});
