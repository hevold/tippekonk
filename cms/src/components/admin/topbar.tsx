'use client';
/**
 * Topbar — sticky header with the mobile menu button, site switcher, the
 * command-palette trigger (⌘K), a "Ny sak" shortcut, notifications and the
 * user menu.
 */
import { Menu, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Kbd, useModKeyLabel } from '@/components/ui/kbd';
import { adminPaths } from '@/config/routes';
import type { MemberRole } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { NotificationsBell } from './notifications-bell';
import { useShell } from './shell-context';
import type { ShellNotification, ShellSite, ShellUser } from './shell-types';
import { SiteSwitcher } from './site-switcher';
import { UserMenu } from './user-menu';

export type TopbarProps = {
  user: ShellUser;
  role: MemberRole;
  site: ShellSite;
  sites: ShellSite[];
  unreadCount: number;
  notifications: ShellNotification[];
  /** Show the "Ny sak" button (article:create). */
  canCreateArticle?: boolean;
  className?: string;
};

export function Topbar({
  user,
  role,
  site,
  sites,
  unreadCount,
  notifications,
  canCreateArticle,
  className,
}: TopbarProps) {
  const t = useT();
  const { setMobileNavOpen, setPaletteOpen } = useShell();
  const mod = useModKeyLabel();

  return (
    <header
      className={cn(
        'bg-surface/85 border-border h-topbar sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-4',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setMobileNavOpen(true)}
        aria-label={t('common.menu')}
        className="text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-ring inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden"
      >
        <Menu className="size-4" aria-hidden />
      </button>

      <SiteSwitcher site={site} sites={sites} className="min-w-0" />

      <div className="flex flex-1 justify-center px-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('shell.search')}
          aria-keyshortcuts="Meta+K Control+K"
          className={cn(
            'bg-bg text-muted border-border hover:border-border-strong hover:text-text hidden h-8 w-full max-w-md items-center gap-2 rounded-md border px-2.5 text-sm transition-colors sm:flex',
            'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          )}
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">{t('shell.searchPlaceholder')}</span>
          <span className="flex items-center gap-0.5" aria-hidden>
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('shell.search')}
          className="text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-ring inline-flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
        >
          <Search className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex items-center gap-1">
        {canCreateArticle ? (
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href={adminPaths.newArticle()}>
              <Plus aria-hidden />
              {t('shell.newArticle')}
            </Link>
          </Button>
        ) : null}
        <NotificationsBell unreadCount={unreadCount} items={notifications} />
        <UserMenu user={user} role={role} />
      </div>
    </header>
  );
}
