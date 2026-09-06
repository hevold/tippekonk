/**
 * Menus (primary, footer, topbar): validation and persistence. Items are a
 * nested tree of { id, label, href, target?, children? } stored as JSON on
 * the `menus` row per site and key. The public site reads them through
 * `getMenus()` in the public area (cached under the site tag, so a save
 * revalidates the whole site).
 */
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { menus, type Menu } from '@/db/schema';
import { hrefSchema } from '@/lib/validation/common';
import type { MenuItem } from '@/lib/validation/site';
import { ConflictError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

export const MENU_KEYS = ['primary', 'footer', 'topbar'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];
export const menuKeySchema = z.enum(MENU_KEYS, { error: 'Ukjent meny' });

export const MENU_MAX_DEPTH = 3;
export const MENU_MAX_ITEMS = 200;

/** One level of the tree; recursion is bounded by MENU_MAX_DEPTH in `menuItemsSchema`. */
const menuItemInputSchema: z.ZodType<MenuItem> = z.lazy(() =>
  z.object({
    id: z.string().trim().min(1, 'Mangler id').max(80, 'Id kan ikke være lengre enn 80 tegn'),
    label: z.string().trim().min(1, 'Teksten må fylles ut').max(80, 'Maks 80 tegn'),
    href: hrefSchema.pipe(z.string().min(1, 'Lenken må fylles ut')),
    target: z.literal('_blank').optional(),
    children: z.array(menuItemInputSchema).optional(),
  }),
);

export function menuDepth(items: MenuItem[], level = 1): number {
  let max = items.length > 0 ? level : 0;
  for (const item of items) {
    if (item.children && item.children.length > 0) {
      max = Math.max(max, menuDepth(item.children, level + 1));
    }
  }
  return max;
}

export function countMenuItems(items: MenuItem[]): number {
  return items.reduce((n, item) => n + 1 + countMenuItems(item.children ?? []), 0);
}

export function menuItemIds(items: MenuItem[]): string[] {
  return items.flatMap((item) => [item.id, ...menuItemIds(item.children ?? [])]);
}

/** Strip empty `children` arrays and undefined targets so stored JSON stays tidy. */
export function normalizeMenuItems(items: MenuItem[]): MenuItem[] {
  return items.map((item) => {
    const out: MenuItem = { id: item.id, label: item.label, href: item.href };
    if (item.target === '_blank') out.target = '_blank';
    const children = item.children ? normalizeMenuItems(item.children) : [];
    if (children.length > 0) out.children = children;
    return out;
  });
}

export const menuItemsSchema = z
  .array(menuItemInputSchema)
  .max(MENU_MAX_ITEMS, `Maks ${MENU_MAX_ITEMS} menypunkter`)
  .refine((items) => menuDepth(items) <= MENU_MAX_DEPTH, {
    error: `Menyen kan ha maks ${MENU_MAX_DEPTH} nivåer`,
  })
  .refine((items) => countMenuItems(items) <= MENU_MAX_ITEMS, {
    error: `Maks ${MENU_MAX_ITEMS} menypunkter til sammen`,
  })
  .refine(
    (items) => {
      const ids = menuItemIds(items);
      return new Set(ids).size === ids.length;
    },
    { error: 'Menypunktene må ha unike id-er' },
  )
  .transform(normalizeMenuItems);

export const saveMenuInputSchema = z.object({
  key: menuKeySchema,
  items: menuItemsSchema,
});
export type SaveMenuInput = z.input<typeof saveMenuInputSchema>;

export type SiteMenus = Record<MenuKey, MenuItem[]>;

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

export const MENU_LABELS: Record<MenuKey, string> = {
  primary: 'Hovedmeny',
  footer: 'Bunnmeny',
  topbar: 'Toppmeny',
};

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
