/**
 * /admin/tilbakestill/[token] — choose a new password. The token is only
 * consumed when the form is submitted.
 */
import type { Metadata } from 'next';

import { t } from '@/lib/i18n';
import { isResetTokenValid } from '@/server/auth/invites';

import { AuthCard, InvalidLinkCard } from '../../_components/auth-card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Velg nytt passord' };

export default async function ResetPasswordPage({ params }: PageProps<'/admin/tilbakestill/[token]'>) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  if (!valid) {
    return (
      <InvalidLinkCard
        title={t('auth.reset.invalidTitle')}
        description={t('auth.reset.invalidDescription')}
        action={{ href: '/admin/glemt-passord', label: t('auth.reset.requestNew') }}
      />
    );
  }
  return (
    <AuthCard title={t('auth.reset.title')} description={t('auth.reset.description')}>
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
