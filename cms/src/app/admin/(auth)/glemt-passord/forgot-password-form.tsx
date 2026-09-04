'use client';
/**
 * ForgotPasswordForm — e-mail input; on success shows the "check your inbox"
 * message in place of the form.
 */
import { MailCheck, Send } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { forgotPasswordAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

export function ForgotPasswordForm() {
  const t = useT();
  const [state, action, pending] = useActionState(forgotPasswordAction, EMPTY_FORM_STATE);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <div className="flex items-start gap-3">
          <div
            className="bg-success-soft text-success flex size-10 shrink-0 items-center justify-center rounded-full"
            aria-hidden
          >
            <MailCheck className="size-5" />
          </div>
          <div>
            <p className="text-text font-semibold">{t('auth.forgot.successTitle')}</p>
            <p className="text-muted mt-1 text-sm leading-5">
              {t('auth.forgot.success', { email: state.values?.email ?? '' })}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={adminPaths.login()}>{t('auth.backToLogin')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? (
        <Alert variant="danger" live>
          {state.error}
        </Alert>
      ) : null}
      <FormField label={t('auth.forgot.email')} htmlFor="email" error={state.fieldErrors?.email} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          required
          defaultValue={state.values?.email ?? ''}
          placeholder="navn@avisa.no"
        />
      </FormField>
      <Button type="submit" size="lg" loading={pending} leftIcon={<Send />} className="w-full">
        {t('auth.forgot.submit')}
      </Button>
      <p className="text-center text-sm">
        <Link
          href={adminPaths.login()}
          className="text-muted hover:text-text focus-visible:outline-ring rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('auth.backToLogin')}
        </Link>
      </p>
    </form>
  );
}
