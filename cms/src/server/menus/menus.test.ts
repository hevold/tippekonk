/**
 * Menus: nested validation (depth, ids, hrefs, normalisation) and the
 * upsert service with audit + cache revalidation.
 */
import { desc } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { auditLog } from '@/db/schema';
import type { Permission } from '@/lib/permissions';
import { ForbiddenError } from '@/server/actions';
import { testContext } from '@/server/settings/test-helpers';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
}));

import { getMenu, listMenus, saveMenu } from './index';
import { countMenuItems, menuDepth, menuItemsSchema, saveMenuInputSchema } from './schema';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('menuItemsSchema', () => {
  it('accepts a nested tree and normalises it', () => {
    const parsed = menuItemsSchema.parse([
      {
        id: 'nyheter',
        label: ' Nyheter ',
        href: '/nyheter',
        target: undefined,
        children: [{ id: 'lokalt', label: 'Lokalt', href: '/nyheter/lokalt', children: [] }],
      },
      { id: 'tips', label: 'Tips oss', href: 'mailto:tips@avisa.no', target: '_blank' },
    ]);
    expect(parsed).toEqual([
      {
        id: 'nyheter',
        label: 'Nyheter',
        href: '/nyheter',
        children: [{ id: 'lokalt', label: 'Lokalt', href: '/nyheter/lokalt' }],
      },
      { id: 'tips', label: 'Tips oss', href: 'mailto:tips@avisa.no', target: '_blank' },
    ]);
    expect(menuDepth(parsed)).toBe(2);
    expect(countMenuItems(parsed)).toBe(3);
  });

  it('rejects too deep trees, duplicate ids, empty labels and bad hrefs', () => {
    const deep = [
      {
        id: 'a',
        label: 'A',
        href: '/a',
        children: [
          {
            id: 'b',
            label: 'B',
            href: '/b',
            children: [{ id: 'c', label: 'C', href: '/c', children: [{ id: 'd', label: 'D', href: '/d' }] }],
          },
        ],
      },
    ];
    expect(menuItemsSchema.safeParse(deep).success).toBe(false);
    expect(
      menuItemsSchema.safeParse([
        { id: 'x', label: 'X', href: '/x' },
        { id: 'x', label: 'Y', href: '/y' },
      ]).success,
    ).toBe(false);
    expect(menuItemsSchema.safeParse([{ id: 'x', label: '', href: '/x' }]).success).toBe(false);
    expect(menuItemsSchema.safeParse([{ id: 'x', label: 'X', href: 'javascript:alert(1)' }]).success).toBe(
      false,
    );
    expect(menuItemsSchema.safeParse([{ id: 'x', label: 'X', href: '//evil.example' }]).success).toBe(false);
    expect(saveMenuInputSchema.safeParse({ key: 'sidebar', items: [] }).success).toBe(false);
  });
});

describe('saveMenu', () => {
  it('upserts, audits and reads back through listMenus/getMenu', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const before = await listMenus(seed.site.id);
    expect(before).toEqual({ primary: [], footer: [], topbar: [] });

    await saveMenu(ctx, { key: 'primary', items: [{ id: 'nyheter', label: 'Nyheter', href: '/nyheter' }] });
    await saveMenu(ctx, {
      key: 'primary',
      items: [
        { id: 'nyheter', label: 'Nyheter', href: '/nyheter' },
        {
          id: 'sport',
          label: 'Sport',
          href: '/sport',
          children: [{ id: 'fotball', label: 'Fotball', href: '/tag/fotball' }],
        },
      ],
    });
    const primary = await getMenu(seed.site.id, 'primary');
    expect(primary).toHaveLength(2);
    expect(primary[1]?.children?.[0]?.href).toBe('/tag/fotball');

    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(entry?.action).toBe('menu.update');
    expect(entry?.data).toMatchObject({ key: 'primary', itemsBefore: 1, itemsAfter: 3 });
  });

  it('forbids users without settings:manage', async () => {
    const ctx = testContext(seed.editor, seed.site, 'editor');
    await expect(saveMenu(ctx, { key: 'footer', items: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
