/**
 * Menu validation (pure, shared by the menu editor on the client and the
 * save action on the server). Items are a nested tree of
 * { id, label, href, target?, children? } — see MenuItem in
 * src/lib/validation/site.ts. Depth and total size are bounded so a menu can
 * never grow into something the public masthead cannot render.
 */
import { z } from 'zod';

import { hrefSchema } from '@/lib/validation/common';
import type { MenuItem } from '@/lib/validation/site';

export const MENU_KEYS = ['primary', 'footer', 'topbar'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];
export const menuKeySchema = z.enum(MENU_KEYS, { error: 'Ukjent meny' });

export const MENU_MAX_DEPTH = 3;
export const MENU_MAX_ITEMS = 200;

/** One level of the tree; recursion is bounded by MENU_MAX_DEPTH in `menuItemsSchema`. */
export const menuItemInputSchema: z.ZodType<MenuItem> = z.lazy(() =>
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

export const MENU_LABELS: Record<MenuKey, string> = {
  primary: 'Hovedmeny',
  footer: 'Bunnmeny',
  topbar: 'Toppmeny',
};
