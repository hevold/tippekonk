/**
 * /admin/brukere — members of the active site with role, status and last
 * login; invite, change role, deactivate/reactivate, remove, re-send invite
 * and (for superadmins) the superadmin flag.
 */
import type { Metadata } from 'next';

import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listSiteMembers } from '@/server/auth/users';

import { InviteUserDialog } from './invite-user-dialog';
import { UsersTable, type MemberRow } from './users-table';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Brukere' };

export default async function UsersPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('user:manage')) {
    return (
      <>
        <PageHeader title={t('users.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }

  const members = await listSiteMembers(ctx.site.id);
  const rows: MemberRow[] = members.map((m) => ({
    ...m,
    lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
    memberSince: m.memberSince.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title={t('users.title')}
        description={t('users.description', { site: ctx.site.name })}
        actions={<InviteUserDialog />}
      />
      <UsersTable
        rows={rows}
        siteName={ctx.site.name}
        currentUserId={ctx.user.id}
        viewerIsSuperadmin={ctx.user.isSuperadmin}
      />
    </>
  );
}
