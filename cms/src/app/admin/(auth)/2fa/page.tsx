/**
 * /admin/2fa — second step for users with TOTP enabled. Requires a session
 * that has not yet proven the second factor; otherwise bounces onwards.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { t } from '@/lib/i18n';
import { safeNextPath } from '@/server/auth/cookies';
import { getSession } from '@/server/auth/session';

import { AuthCard } from '../_components/auth-card';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Totrinnsbekreftelse' };

export default async function TwoFactorPage({ searchParams }: PageProps<'/admin/2fa'>) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeNextPath(rawNext);

  const current = await getSession();
  if (!current) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  if (current.session.mfaVerified || !current.user.totpEnabled) redirect(next);

  return (
    <AuthCard title={t('auth.twoFactor.title')} description={t('auth.twoFactor.description')}>
      <TwoFactorForm next={next} email={current.user.email} />
    </AuthCard>
  );
}
