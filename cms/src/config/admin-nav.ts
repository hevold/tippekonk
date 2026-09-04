/**
 * Admin navigation registry. The shell renders this; features do not edit it.
 * `permission` gates visibility. `labelKey` resolves through i18n.
 */
import type { Permission } from '@/lib/permissions';

import { adminPaths } from './routes';

export type AdminNavItem = {
  key: string;
  labelKey: string;
  href: string;
  /** lucide-react icon name, resolved by the shell. */
  icon:
    | 'LayoutDashboard'
    | 'FileText'
    | 'CalendarDays'
    | 'Image'
    | 'LayoutTemplate'
    | 'Radio'
    | 'FolderTree'
    | 'Tags'
    | 'Users'
    | 'PenLine'
    | 'Blocks'
    | 'Settings'
    | 'ScrollText';
  permission: Permission;
  group: 'content' | 'structure' | 'admin';
};

export const ADMIN_NAV: AdminNavItem[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', href: adminPaths.dashboard(), icon: 'LayoutDashboard', permission: 'admin:access', group: 'content' },
  { key: 'articles', labelKey: 'nav.articles', href: adminPaths.articles(), icon: 'FileText', permission: 'admin:access', group: 'content' },
  { key: 'plan', labelKey: 'nav.plan', href: adminPaths.plan(), icon: 'CalendarDays', permission: 'admin:access', group: 'content' },
  { key: 'media', labelKey: 'nav.media', href: adminPaths.media(), icon: 'Image', permission: 'admin:access', group: 'content' },
  { key: 'live', labelKey: 'nav.live', href: adminPaths.live(), icon: 'Radio', permission: 'live:manage', group: 'content' },
  { key: 'front', labelKey: 'nav.front', href: adminPaths.front(), icon: 'LayoutTemplate', permission: 'layout:edit', group: 'structure' },
  { key: 'sections', labelKey: 'nav.sections', href: adminPaths.sections(), icon: 'FolderTree', permission: 'taxonomy:manage', group: 'structure' },
  { key: 'tags', labelKey: 'nav.tags', href: adminPaths.tags(), icon: 'Tags', permission: 'taxonomy:manage', group: 'structure' },
  { key: 'authors', labelKey: 'nav.authors', href: adminPaths.authors(), icon: 'PenLine', permission: 'taxonomy:manage', group: 'structure' },
  { key: 'contentTypes', labelKey: 'nav.contentTypes', href: adminPaths.contentTypes(), icon: 'Blocks', permission: 'content_type:manage', group: 'structure' },
  { key: 'users', labelKey: 'nav.users', href: adminPaths.users(), icon: 'Users', permission: 'user:manage', group: 'admin' },
  { key: 'settings', labelKey: 'nav.settings', href: adminPaths.settings(), icon: 'Settings', permission: 'settings:manage', group: 'admin' },
  { key: 'audit', labelKey: 'nav.audit', href: adminPaths.audit(), icon: 'ScrollText', permission: 'audit:view', group: 'admin' },
];
