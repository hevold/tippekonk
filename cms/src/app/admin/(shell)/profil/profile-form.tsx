'use client';
/**
 * ProfileForm — name, e-mail and admin language (useActionState).
 */
import { Save } from 'lucide-react';
import { useActionState, useEffect } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { LOCALES, type Locale } from '@/lib/i18n';
import { useT } from '@/lib/i18n/client';
import { updateProfileAction } from '@/server/auth/actions';
import { EMPTY_FORM_STATE } from '@/server/auth/form-state';

export function ProfileForm({ initial }: { initial: { name: string; email: string; locale: Locale } }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateProfileAction, EMPTY_FORM_STATE);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? initial;

  useEffect(() => {
    if (state.success) toast.success(t('users.profile.saved'));
  }, [state, t]);

  return (
    <Card>
      <form action={action} noValidate className="contents">
        <CardHeader>
          <CardTitle>{t('users.profile.section.details')}</CardTitle>
          <CardDescription>{t('users.profile.section.detailsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {state.error ? (
            <Alert variant="danger" live>
              {state.error}
            </Alert>
          ) : null}
          <FormField label={t('users.profile.name')} htmlFor="profile-name" error={errors.name} required>
            <Input
              id="profile-name"
              name="name"
              autoComplete="name"
              maxLength={120}
              required
              defaultValue={values.name}
            />
          </FormField>
          <FormField label={t('users.profile.email')} htmlFor="profile-email" error={errors.email} required>
            <Input
              id="profile-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              defaultValue={values.email}
            />
          </FormField>
          <FormField label={t('users.profile.locale')} htmlFor="profile-locale" error={errors.locale}>
            <NativeSelect
              id="profile-locale"
              name="locale"
              defaultValue={values.locale}
              options={LOCALES.map((l) => ({ value: l, label: t(`users.profile.locale.${l}`) }))}
            />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={pending} leftIcon={<Save />}>
            {t('users.profile.save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
