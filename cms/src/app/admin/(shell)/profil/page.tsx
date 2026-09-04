/**
 * /admin/profil — the signed-in user's profile: details, password,
 * two-factor authentication and active sessions.
 */
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { describeUserAgent, listOwnSessions, remainingRecoveryCodes } from '@/server/auth/profile';

import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';
import { SessionsCard, type SessionRow } from './sessions-card';
import { TwoFactorCard } from './two-factor-card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Min profil' };

export default async function ProfilePage() {
  const ctx = await getAdminContext();
  const sessions = await listOwnSessions(ctx);
  const rows: SessionRow[] = sessions.map((s) => ({
    id: s.id,
    current: s.current,
    ip: s.ip,
    device: describeUserAgent(s.userAgent),
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
  }));
  const roleLabel = ctx.user.isSuperadmin ? t('shell.superadmin') : t(`common.role.${ctx.role}`);

  return (
    <>
      <PageHeader
        title={t('users.profile.title')}
        description={t('users.profile.description')}
        eyebrow={
          <Badge variant="outline">
            {t('users.profile.role', { site: ctx.site.name })}: {roleLabel}
          </Badge>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileForm initial={{ name: ctx.user.name, email: ctx.user.email, locale: ctx.locale }} />
        <PasswordForm />
        <TwoFactorCard enabled={ctx.user.totpEnabled} recoveryCodesLeft={remainingRecoveryCodes(ctx.user)} />
        <SessionsCard rows={rows} />
      </div>
    </>
  );
}
