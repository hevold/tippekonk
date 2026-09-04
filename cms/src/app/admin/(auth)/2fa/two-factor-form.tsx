'use client';
/**
 * TwoFactorForm — one input for a 6-digit TOTP code or a recovery code.
 */
import { ShieldCheck } from 'lucide-react';
import { useActionState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { verifyTotpAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

export function TwoFactorForm({ next, email }: { next: string; email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(verifyTotpAction, EMPTY_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <p className="text-muted -mt-2 text-sm">{t('auth.twoFactor.signedInAs', { email })}</p>
      {state.error ? (
        <Alert variant="danger" live>
          {state.error}
        </Alert>
      ) : null}
      <FormField
        label={t('auth.twoFactor.code')}
        htmlFor="code"
        help={t('auth.twoFactor.codeHelp')}
        error={state.fieldErrors?.code}
        required
      >
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={20}
          className="text-center font-mono text-lg tracking-[0.3em]"
        />
      </FormField>
      <Button type="submit" size="lg" loading={pending} leftIcon={<ShieldCheck />} className="w-full">
        {t('auth.twoFactor.submit')}
      </Button>
      <p className="text-center text-sm">
        <a
          href={adminPaths.logout()}
          className="text-muted hover:text-text focus-visible:outline-ring rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t('auth.twoFactor.cancel')}
        </a>
      </p>
    </form>
  );
}
