/**
 * /admin/login — e-mail + password. Already signed-in users are sent on to
 * the admin. Query flags render a one-line notice: `reset=1` after a
 * password reset, `out=1` after logout, `expired=1` when a session died.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { t } from '@/lib/i18n';
import { resolveAdminState } from '@/server/auth/context';
import { safeNextPath } from '@/server/auth/cookies';

import { AuthCard } from '../_components/auth-card';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Logg inn' };

export default async function LoginPage({ searchParams }: PageProps<'/admin/login'>) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNextPath(first(params.next));

  const state = await resolveAdminState();
  if (state.kind === 'ok' || state.kind === 'no_membership')
    redirect(state.kind === 'ok' ? next : '/admin/ingen-tilgang');
  if (state.kind === 'mfa_required') redirect(`/admin/2fa?next=${encodeURIComponent(next)}`);

  const notice = first(params.reset)
    ? t('auth.login.resetDone')
    : first(params.out)
      ? t('auth.login.loggedOut')
      : first(params.expired)
        ? t('auth.login.sessionExpired')
        : null;

  return (
    <AuthCard title={t('auth.login.title')} description={t('auth.login.description')}>
      <LoginForm next={next} notice={notice} />
    </AuthCard>
  );
}
