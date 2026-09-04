'use client';
/**
 * AcceptInviteForm — name + password for a freshly invited user.
 */
import { UserRoundCheck } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { acceptInviteAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

import { PasswordField } from '../../_components/password-field';

export function AcceptInviteForm({
  token,
  email,
  initialName,
  siteId,
}: {
  token: string;
  email: string;
  initialName: string;
  siteId: string | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState(acceptInviteAction, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const alreadyUsed = state.error === t('auth.invite.alreadyAccepted');

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {siteId ? <input type="hidden" name="siteId" value={siteId} /> : null}
      {state.error ? (
        <Alert
          variant="danger"
          live
          actions={
            alreadyUsed ? (
              <Button asChild variant="link" size="sm">
                <Link href={adminPaths.login()}>{t('auth.invite.goToLogin')}</Link>
              </Button>
            ) : undefined
          }
        >
          {state.error}
        </Alert>
      ) : null}
      <FormField label={t('auth.invite.email')} htmlFor="email">
        <Input id="email" type="email" value={email} readOnly disabled autoComplete="username" />
      </FormField>
      <FormField label={t('auth.invite.name')} htmlFor="name" error={errors.name} required>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          autoFocus
          required
          maxLength={120}
          defaultValue={state.values?.name ?? initialName}
        />
      </FormField>
      <FormField
        label={t('auth.invite.password')}
        htmlFor="password"
        error={errors.password}
        help={t('auth.passwordRule')}
        required
      >
        <PasswordField id="password" name="password" autoComplete="new-password" required minLength={10} />
      </FormField>
      <FormField
        label={t('auth.invite.passwordConfirm')}
        htmlFor="passwordConfirm"
        error={errors.passwordConfirm}
        required
      >
        <PasswordField id="passwordConfirm" name="passwordConfirm" autoComplete="new-password" required />
      </FormField>
      <Button type="submit" size="lg" loading={pending} leftIcon={<UserRoundCheck />} className="w-full">
        {t('auth.invite.submit')}
      </Button>
    </form>
  );
}
