'use client';
/**
 * Sidebar — the admin's primary navigation. Reads the shared ADMIN_NAV
 * registry (already filtered by permission by the shell), groups it into
 * Innhold / Struktur / Administrasjon, highlights the active route and can
 * collapse to icons (persisted in localStorage by the shell).
 *
 * `variant="sheet"` renders the same list inside the mobile drawer.
 */
import {
  Blocks,
  CalendarDays,
  FileText,
  FolderTree,
  Image,
  LayoutDashboard,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Radio,
  ScrollText,
  Settings,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Tooltip } from '@/components/ui/tooltip';
import { adminPaths } from '@/config/routes';
import type { AdminNavItem } from '@/config/admin-nav';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { activeNavKey, groupNavItems } from './nav-helpers';
import { useShell } from './shell-context';

export const NAV_ICONS: Record<AdminNavItem['icon'], LucideIcon> = {
  LayoutDashboard,
  FileText,
  CalendarDays,
  Image,
  LayoutTemplate,
  Radio,
  FolderTree,
  Tags,
  Users,
  PenLine,
  Blocks,
  Settings,
  ScrollText,
};

export type SidebarProps = {
  /** Nav items visible to the current user (see visibleNavItems). */
  items: AdminNavItem[];
  siteName: string;
  variant?: 'desktop' | 'sheet';
  /** Called after a link is chosen (closes the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
};

export function Sidebar({ items, siteName, variant = 'desktop', onNavigate, className }: SidebarProps) {
  const t = useT();
  const pathname = usePathname();
  const { collapsed: collapsedState, setCollapsed } = useShell();
  const collapsed = variant === 'desktop' && collapsedState;
  const activeKey = activeNavKey(pathname, items);
  const groups = groupNavItems(items);

  return (
    <div
      className={cn(
        'bg-surface text-text flex h-full flex-col',
        variant === 'desktop' && 'border-border border-r',
        className,
      )}
      data-collapsed={collapsed ? '' : undefined}
    >
      <div
        className={cn(
          'h-topbar border-border flex shrink-0 items-center border-b',
          collapsed ? 'justify-center px-2' : 'px-3',
        )}
      >
        <Link
          href={adminPaths.dashboard()}
          onClick={onNavigate}
          className="focus-visible:outline-ring flex min-w-0 items-center gap-2.5 rounded-md py-1 pr-1 focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={t('shell.home', { site: siteName })}
        >
          <span
            className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md font-serif text-[15px] font-bold"
            aria-hidden
          >
            D
          </span>
          {!collapsed ? (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-semibold">{t('common.appName')}</span>
              <span className="text-muted block truncate text-[11px]">{siteName}</span>
            </span>
          ) : null}
        </Link>
      </div>

      <nav aria-label={t('shell.mainNav')} className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map(({ group, items: groupItems }, index) => (
          <div key={group} className={cn(index > 0 && 'mt-3')}>
            {collapsed ? (
              index > 0 ? (
                <div className="bg-border mx-2 mb-3 h-px" aria-hidden />
              ) : null
            ) : (
              <p className="text-subtle mb-1 px-2 text-[11px] font-semibold tracking-wide uppercase">
                {t(`nav.group.${group}`)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = item.key === activeKey;
                const label = t(item.labelKey);
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-8 items-center gap-2.5 rounded-md text-sm transition-colors',
                      'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                      collapsed ? 'justify-center px-0' : 'px-2',
                      active
                        ? 'bg-primary-soft text-primary font-medium'
                        : 'text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden strokeWidth={active ? 2.25 : 2} />
                    {!collapsed ? (
                      <span className="truncate">{label}</span>
                    ) : (
                      <span className="sr-only">{label}</span>
                    )}
                  </Link>
                );
                return (
                  <li key={item.key}>
                    {collapsed ? (
                      <Tooltip content={label} side="right">
                        {link}
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {variant === 'desktop' ? (
        <div
          className={cn(
            'border-border flex shrink-0 items-center border-t p-2',
            collapsed ? 'justify-center' : 'justify-end',
          )}
        >
          <Tooltip content={collapsed ? t('shell.expand') : t('shell.collapse')} side="right">
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-pressed={collapsed}
              aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}
              className="text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-ring inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" aria-hidden />
              ) : (
                <PanelLeftClose className="size-4" aria-hidden />
              )}
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}
