/**
 * Menus (primary, footer, topbar): persistence and the save service. The
 * validation lives in ./schema.ts (pure, also used by the client editor).
 * The public site reads menus through `getMenus()` in the public area
 * (cached under the site tag, so a save revalidates the whole site).
 */
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { menus, type Menu } from '@/db/schema';
import type { MenuItem } from '@/lib/validation/site';
import { ConflictError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

import {
  countMenuItems,
  MENU_KEYS,
  MENU_LABELS,
  menuItemsSchema,
  saveMenuInputSchema,
  type MenuKey,
  type SiteMenus,
} from './schema';

export * from './schema';

/** All three menus for a site; missing rows are returned as empty lists. */
export async function listMenus(siteId: string): Promise<SiteMenus> {
  const rows = await db.select().from(menus).where(eq(menus.siteId, siteId));
  const out: SiteMenus = { primary: [], footer: [], topbar: [] };
  for (const row of rows) {
    if ((MENU_KEYS as readonly string[]).includes(row.key)) {
      const parsed = menuItemsSchema.safeParse(Array.isArray(row.items) ? row.items : []);
      out[row.key as MenuKey] = parsed.success ? parsed.data : [];
    }
  }
  return out;
}

export async function getMenu(siteId: string, key: MenuKey): Promise<MenuItem[]> {
  const all = await listMenus(siteId);
  return all[key];
}

/** Replace one menu (upsert). Audits and revalidates the public site. */
export async function saveMenu(ctx: AdminContext, input: unknown): Promise<Menu> {
  assertCan(ctx, 'settings:manage');
  const { key, items } = saveMenuInputSchema.parse(input);

  const [existing] = await db
    .select({ id: menus.id, items: menus.items })
    .from(menus)
    .where(and(eq(menus.siteId, ctx.site.id), eq(menus.key, key)))
    .limit(1);

  const before = existing ? countMenuItems(Array.isArray(existing.items) ? existing.items : []) : 0;
  const [saved] = await db
    .insert(menus)
    .values({ siteId: ctx.site.id, key, items, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [menus.siteId, menus.key],
      set: { items, updatedAt: new Date() },
    })
    .returning();
  if (!saved) throw new ConflictError('Kunne ikke lagre menyen.');

  await auditFromContext(ctx, {
    action: 'menu.update',
    entityType: 'menu',
    entityId: saved.id,
    summary: `Lagret ${MENU_LABELS[key].toLowerCase()} (${countMenuItems(items)} punkter)`,
    data: { key, itemsBefore: before, itemsAfter: countMenuItems(items) },
  });
  revalidatePublic(ctx.site.id);
  return saved;
}
