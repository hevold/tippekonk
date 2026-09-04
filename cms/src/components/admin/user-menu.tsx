'use client';
/**
 * UserMenu — avatar button in the topbar with profile, notifications,
 * keyboard shortcuts and logout.
 */
import { Bell, Keyboard, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminPaths } from '@/config/routes';
import type { MemberRole } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { useShell } from './shell-context';
import type { ShellUser } from './shell-types';

export type UserMenuProps = {
  user: ShellUser;
  role: MemberRole;
  className?: string;
};

export function UserMenu({ user, role, className }: UserMenuProps) {
  const t = useT();
  const { setShortcutsOpen } = useShell();
  const roleLabel = user.isSuperadmin ? t('shell.superadmin') : t(`common.role.${role}`);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.profileMenu', { name: user.name })}
        className={cn(
          'hover:bg-surface-2 flex h-8 items-center gap-2 rounded-full pr-1 pl-0.5 transition-colors',
          'focus-visible:outline-ring data-[state=open]:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2',
          className,
        )}
      >
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
          {user.name.split(' ')[0]}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={user.name} src={user.avatarUrl} size="md" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-muted truncate text-xs">{user.email}</p>
            <p className="text-subtle mt-0.5 text-[11px] font-medium tracking-wide uppercase">{roleLabel}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild icon={<UserRound />}>
          <Link href={adminPaths.profile()}>{t('shell.profile')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild icon={<Bell />}>
          <Link href={adminPaths.notifications()}>{t('shell.notifications')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Keyboard />} shortcut="?" onSelect={() => setShortcutsOpen(true)}>
          {t('shell.shortcuts')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* INTEGRATION: /admin/logout is a route handler owned by the auth area (GET → destroy session → redirect). */}
        <DropdownMenuItem asChild icon={<LogOut />}>
          <a href={adminPaths.logout()}>{t('shell.logout')}</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
