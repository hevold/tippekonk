'use client';
/**
 * ResetPasswordForm — new password + confirmation, bound to resetPasswordAction.
 */
import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { useT } from '@/lib/i18n/client';
import { resetPasswordAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

import { PasswordField } from '../../_components/password-field';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(resetPasswordAction, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const dead = state.error === t('auth.reset.invalid');

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Alert
          variant="danger"
          live
          actions={
            dead ? (
              <Button asChild variant="link" size="sm">
                <Link href="/admin/glemt-passord">{t('auth.reset.requestNew')}</Link>
              </Button>
            ) : undefined
          }
        >
          {state.error}
        </Alert>
      ) : null}
      <FormField
        label={t('auth.reset.password')}
        htmlFor="password"
        error={errors.password}
        help={t('auth.passwordRule')}
        required
      >
        <PasswordField
          id="password"
          name="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={10}
        />
      </FormField>
      <FormField
        label={t('auth.reset.passwordConfirm')}
        htmlFor="passwordConfirm"
        error={errors.passwordConfirm}
        required
      >
        <PasswordField id="passwordConfirm" name="passwordConfirm" autoComplete="new-password" required />
      </FormField>
      <Button type="submit" size="lg" loading={pending} leftIcon={<KeyRound />} className="w-full">
        {t('auth.reset.submit')}
      </Button>
    </form>
  );
}
