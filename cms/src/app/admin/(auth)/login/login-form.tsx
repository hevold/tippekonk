'use client';
/**
 * LoginForm — progressive form bound to `loginAction` via useActionState.
 * Works without JavaScript (plain POST) and shows errors inline.
 */
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { loginAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

import { PasswordField } from '../_components/password-field';

export function LoginForm({ next, notice }: { next: string; notice: string | null }) {
  const t = useT();
  const [state, action, pending] = useActionState(loginAction, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? (
        <Alert variant="danger" live>
          {state.error}
        </Alert>
      ) : notice ? (
        <Alert variant="success">{notice}</Alert>
      ) : null}
      <FormField label={t('auth.login.email')} htmlFor="email" error={errors.email} required>
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
      <FormField label={t('auth.login.password')} htmlFor="password" error={errors.password} required>
        <PasswordField id="password" name="password" autoComplete="current-password" required />
      </FormField>
      <Button type="submit" size="lg" loading={pending} leftIcon={<LogIn />} className="mt-1 w-full">
        {t('auth.login.submit')}
      </Button>
      <p className="text-center text-sm">
        <Link
          href={`${adminPaths.login().replace('/login', '/glemt-passord')}`}
          className="text-primary focus-visible:outline-ring rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('auth.login.forgot')}
        </Link>
      </p>
    </form>
  );
}
