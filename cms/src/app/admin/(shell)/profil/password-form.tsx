'use client';
/**
 * PasswordForm — change password (requires the current one). Other sessions
 * are logged out on success.
 */
import { KeyRound } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { changePasswordAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

import { PasswordField } from '../../(auth)/_components/password-field';

export function PasswordForm() {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changePasswordAction, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.success) {
      toast.success(t('users.profile.passwordChanged'));
      formRef.current?.reset();
    }
  }, [state, t]);

  return (
    <Card>
      <form ref={formRef} action={action} noValidate className="contents">
        <CardHeader>
          <CardTitle>{t('users.profile.section.password')}</CardTitle>
          <CardDescription>{t('users.profile.section.passwordDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.error && !errors.currentPassword ? (
            <Alert variant="danger" live>
              {state.error}
            </Alert>
          ) : null}
          <FormField
            label={t('users.profile.currentPassword')}
            htmlFor="current-password"
            error={errors.currentPassword}
            required
          >
            <PasswordField
              id="current-password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </FormField>
          <FormField
            label={t('users.profile.newPassword')}
            htmlFor="new-password"
            error={errors.password}
            help={t('auth.passwordRule')}
            required
          >
            <PasswordField
              id="new-password"
              name="password"
              autoComplete="new-password"
              required
              minLength={10}
            />
          </FormField>
          <FormField
            label={t('users.profile.newPasswordConfirm')}
            htmlFor="new-password-confirm"
            error={errors.passwordConfirm}
            required
          >
            <PasswordField
              id="new-password-confirm"
              name="passwordConfirm"
              autoComplete="new-password"
              required
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" variant="outline" loading={pending} leftIcon={<KeyRound />}>
            {t('users.profile.changePassword')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
