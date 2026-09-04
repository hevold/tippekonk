'use client';
/**
 * AdminShell — the frame around every admin page: skip link, sidebar
 * (a Sheet under lg), topbar, main content, command palette (⌘K) and the
 * keyboard-shortcuts dialog (?). Receives plain data from the shell layout.
 */
import { Image as ImageIcon, LayoutTemplate, Newspaper, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CommandPalette, type PaletteItem, type PaletteSearchResult } from '@/components/ui/command-palette';
import { isEditableTarget, isModKey } from '@/components/ui/palette-helpers';
import { Sheet } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import type { Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog';
import { visibleNavItems } from './nav-helpers';
import { searchArticlesForPalette } from './palette-actions';
import { ShellContext, useSidebarCollapsed, type ShellState } from './shell-context';
import type { AdminShellData } from './shell-types';
import { NAV_ICONS, Sidebar } from './sidebar';
import { Topbar } from './topbar';

export type AdminShellProps = AdminShellData & {
  children: ReactNode;
};

export function AdminShell({
  user,
  site,
  sites,
  role,
  permissions,
  unreadNotifications,
  notifications,
  children,
}: AdminShellProps) {
  const t = useT();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  // Global single-key shortcuts: "?" opens the cheat sheet, "[" toggles the sidebar.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === '[' && !isModKey(e, '[')) {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [collapsed, setCollapsed]);

  const can = useCallback((p: Permission) => permissions.includes(p), [permissions]);
  const navItems = useMemo(() => visibleNavItems(permissions), [permissions]);

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const goTo = t('shell.palette.goTo');
    const actions = t('shell.palette.actions');
    const items: PaletteItem[] = [];
    if (can('article:create')) {
      items.push({
        id: 'action-new-article',
        label: t('shell.newArticle'),
        href: adminPaths.newArticle(),
        icon: <Plus />,
        group: actions,
        keywords: ['ny', 'sak', 'artikkel', 'opprett'],
      });
    }
    if (can('media:upload')) {
      items.push({
        id: 'action-media',
        label: t('shell.palette.uploadMedia'),
        href: adminPaths.media(),
        icon: <ImageIcon />,
        group: actions,
        keywords: ['bilde', 'last opp', 'media'],
      });
    }
    if (can('layout:edit')) {
      items.push({
        id: 'action-front',
        label: t('shell.palette.editFront'),
        href: adminPaths.front(),
        icon: <LayoutTemplate />,
        group: actions,
        keywords: ['forside', 'layout'],
      });
    }
    for (const item of navItems) {
      const Icon = NAV_ICONS[item.icon];
      items.push({
        id: `nav-${item.key}`,
        label: t(item.labelKey),
        href: item.href,
        icon: <Icon />,
        group: goTo,
        keywords: [item.key, item.href],
      });
    }
    items.push({
      id: 'action-shortcuts',
      label: t('shell.shortcuts'),
      onSelect: () => setShortcutsOpen(true),
      group: actions,
      shortcut: '?',
      keywords: ['tastatur', 'snarveier', 'hjelp'],
    });
    if (sites.length > 1) {
      items.push({
        id: 'action-view-site',
        label: t('shell.viewSite'),
        onSelect: () => window.open('/', '_blank', 'noopener'),
        icon: <Newspaper />,
        group: actions,
      });
    }
    return items;
  }, [can, navItems, sites.length, t]);

  const search = useCallback(async (query: string): Promise<PaletteSearchResult[]> => {
    const result = await searchArticlesForPalette(query);
    return result.ok ? result.data : [];
  }, []);

  const shell = useMemo<ShellState>(
    () => ({
      paletteOpen,
      setPaletteOpen,
      shortcutsOpen,
      setShortcutsOpen,
      mobileNavOpen,
      setMobileNavOpen,
      collapsed,
      setCollapsed,
    }),
    [paletteOpen, shortcutsOpen, mobileNavOpen, collapsed, setCollapsed],
  );

  return (
    <ShellContext.Provider value={shell}>
      <TooltipProvider delayDuration={300} skipDelayDuration={200}>
        <div className="bg-bg text-text flex min-h-dvh">
          <a
            href="#main-content"
            className="bg-primary text-primary-foreground focus-visible:outline-ring sr-only z-[100] rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {t('common.skipToContent')}
          </a>

          <aside
            className={cn(
              'sticky top-0 hidden h-dvh shrink-0 lg:block',
              collapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
            )}
            aria-label={t('shell.sidebar')}
          >
            <Sidebar items={navItems} siteName={site.name} variant="desktop" />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar
              user={user}
              role={role}
              site={site}
              sites={sites}
              unreadCount={unreadNotifications}
              notifications={notifications}
              canCreateArticle={can('article:create')}
            />
            <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8">
              <div className="mx-auto w-full max-w-[1400px]">{children}</div>
            </main>
          </div>

          <Sheet
            open={mobileNavOpen}
            onOpenChange={setMobileNavOpen}
            side="left"
            size="sm"
            title={t('common.menu')}
            hideHeader
            flush
            className="max-w-[18rem]"
          >
            <Sidebar
              items={navItems}
              siteName={site.name}
              variant="sheet"
              onNavigate={() => setMobileNavOpen(false)}
            />
          </Sheet>

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            items={paletteItems}
            search={search}
          />
          <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        </div>
      </TooltipProvider>
    </ShellContext.Provider>
  );
}
