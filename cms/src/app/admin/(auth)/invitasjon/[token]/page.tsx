/**
 * /admin/invitasjon/[token] — accept an invitation: pick a name and a
 * password. The invitation is looked up (not consumed) to show who it is for.
 */
import type { Metadata } from 'next';

import { t } from '@/lib/i18n';
import { previewInvite, roleLabel } from '@/server/auth/invites';

import { AuthCard, InvalidLinkCard } from '../../_components/auth-card';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata: Metadata = { title: 'Invitasjon' };

export default async function InvitationPage({ params }: PageProps<'/admin/invitasjon/[token]'>) {
  const { token } = await params;
  const invite = await previewInvite(token);
  if (!invite) {
    return (
      <InvalidLinkCard
        title={t('auth.invite.invalidTitle')}
        description={t('auth.invite.invalidDescription')}
        action={{ href: '/admin/login', label: t('auth.invite.goToLogin') }}
      />
    );
  }
  const title = invite.site
    ? t('auth.invite.title', { site: invite.site.name })
    : t('auth.invite.titleGeneric');
  const description = invite.role
    ? t('auth.invite.description', { role: roleLabel(invite.role).toLowerCase() })
    : t('auth.invite.descriptionGeneric');
  return (
    <AuthCard title={title} description={description}>
      <AcceptInviteForm
        token={token}
        email={invite.user.email}
        initialName={invite.user.name}
        siteId={invite.site?.id ?? null}
      />
    </AuthCard>
  );
}
