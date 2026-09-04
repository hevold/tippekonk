/**
 * Pure helpers for the admin navigation: permission filtering, grouping,
 * active-state matching and the persisted sidebar state. No React here so
 * the logic is unit-testable in the node environment.
 */
import { ADMIN_NAV, type AdminNavItem } from '@/config/admin-nav';
import type { Permission } from '@/lib/permissions';

export const NAV_GROUPS = ['content', 'structure', 'admin'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

/** Items the current user may see, in registry order. */
export function visibleNavItems(
  permissions: readonly Permission[],
  items: readonly AdminNavItem[] = ADMIN_NAV,
): AdminNavItem[] {
  const allowed = new Set(permissions);
  return items.filter((item) => allowed.has(item.permission));
}

/** Group items by `group`, keeping the fixed group order and dropping empty groups. */
export function groupNavItems(items: readonly AdminNavItem[]): { group: NavGroup; items: AdminNavItem[] }[] {
  return NAV_GROUPS.map((group) => ({ group, items: items.filter((i) => i.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/**
 * Whether a nav item is active for the current pathname. The dashboard is
 * only active on an exact match; every other item matches itself and its
 * sub-routes (/admin/artikler/123 → "Saker").
 */
export function isNavActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  const target = href.replace(/\/+$/, '') || '/';
  if (target === '/admin' || target === '/') return path === target;
  return path === target || path.startsWith(`${target}/`);
}

/** Pick the single best (longest) matching item so nested routes highlight one entry. */
export function activeNavKey(pathname: string, items: readonly AdminNavItem[]): string | null {
  let best: AdminNavItem | null = null;
  for (const item of items) {
    if (!isNavActive(pathname, item.href)) continue;
    if (!best || item.href.length > best.href.length) best = item;
  }
  return best?.key ?? null;
}

export const SIDEBAR_STORAGE_KEY = 'desken:sidebar-collapsed';

/** Read the persisted sidebar state; false when unavailable (SSR, private mode). */
export function readSidebarCollapsed(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  collapsed: boolean,
): void {
  try {
    storage?.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage may be full or blocked; the UI state still works for the session.
  }
}

/** Greeting key by Oslo hour: 05–09 morning, 10–17 day, else evening. */
export function greetingKey(
  hour: number,
): 'dashboard.greeting.morning' | 'dashboard.greeting.day' | 'dashboard.greeting.evening' {
  if (hour >= 5 && hour < 10) return 'dashboard.greeting.morning';
  if (hour >= 10 && hour < 18) return 'dashboard.greeting.day';
  return 'dashboard.greeting.evening';
}
