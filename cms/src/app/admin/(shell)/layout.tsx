/**
 * Admin shell layout. Resolves the signed-in user and active site once,
 * sets the request locale for server-side t(), and renders the client
 * <AdminShell> with plain data (user, site, sites, role, permissions,
 * notifications). Every page under (shell) is dynamic.
 */
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import type { ShellNotification, ShellSite } from '@/components/admin/shell-types';
import { Toaster } from '@/components/ui/toast';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { setRequestLocale } from '@/lib/i18n';
import { I18nProvider } from '@/lib/i18n/client';
import { PERMISSIONS } from '@/lib/permissions';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Desken', template: '%s – Desken' },
  robots: { index: false, follow: false },
};

const BELL_LIMIT = 8;

export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const ctx = await getAdminContext();
  setRequestLocale(ctx.locale);

  const [latest, unread] = await Promise.all([
    db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        link: notifications.link,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, ctx.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(BELL_LIMIT),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
  ]);

  const items: ShellNotification[] = latest.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  const toShellSite = (s: { id: string; name: string; slug: string }): ShellSite => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
  });

  return (
    <I18nProvider locale={ctx.locale}>
      <AdminShell
        user={{
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          avatarUrl: null,
          isSuperadmin: ctx.user.isSuperadmin,
        }}
        site={toShellSite(ctx.site)}
        sites={ctx.sites.map(toShellSite)}
        role={ctx.role}
        permissions={PERMISSIONS.filter((p) => ctx.can(p))}
        unreadNotifications={unread[0]?.value ?? 0}
        notifications={items}
      >
        {children}
      </AdminShell>
      <Toaster />
    </I18nProvider>
  );
}
