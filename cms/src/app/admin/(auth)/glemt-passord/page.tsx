/**
 * /admin/glemt-passord — request a password reset link. The response is the
 * same whether or not the address exists.
 */
import type { Metadata } from 'next';

import { t } from '@/lib/i18n';

import { AuthCard } from '../_components/auth-card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = { title: 'Glemt passord' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title={t('auth.forgot.title')} description={t('auth.forgot.description')}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
