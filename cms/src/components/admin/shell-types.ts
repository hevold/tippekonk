/**
 * Serialisable props shared between the admin shell layout (server) and the
 * shell's client components. Only plain data crosses the boundary — dates are
 * ISO strings, permissions a string array — so the layout can pick exactly
 * what the client needs from AdminContext.
 */
import type { MemberRole } from '@/db/schema';
import type { Permission } from '@/lib/permissions';

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  isSuperadmin: boolean;
};

export type ShellSite = {
  id: string;
  name: string;
  slug: string;
};

export type ShellNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  /** ISO timestamp or null when unread. */
  readAt: string | null;
  /** ISO timestamp. */
  createdAt: string;
};

export type AdminShellData = {
  user: ShellUser;
  site: ShellSite;
  sites: ShellSite[];
  role: MemberRole;
  permissions: Permission[];
  unreadNotifications: number;
  notifications: ShellNotification[];
};
