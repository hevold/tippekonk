'use client';
/**
 * InviteUserDialog — "Inviter bruker" button + dialog (react-hook-form + zod)
 * calling `inviteUserAction`.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { UserRoundPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { ROLE_ORDER } from '@/lib/permissions';
import { useT } from '@/lib/i18n/client';
import { emailSchema, trimmed } from '@/lib/validation/common';
import { memberRoleSchema } from '@/lib/validation/user';
import { inviteUserAction } from '@/server/auth/actions';

const formSchema = z.object({
  email: emailSchema,
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  role: memberRoleSchema,
  createAuthor: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

const ROLES = [...ROLE_ORDER].reverse();

export function InviteUserDialog() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', name: '', role: 'journalist', createAuthor: true },
  });
  const { register, handleSubmit, control, reset, setError, formState } = form;
  const role = useWatch({ control, name: 'role' });

  function close() {
    setOpen(false);
    setFormError(null);
    reset();
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const result = await inviteUserAction(values);
    if (!result.ok) {
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          if (field === 'email' || field === 'name' || field === 'role') {
            setError(field, { message: messages[0] });
          }
        }
      }
      setFormError(result.error);
      return;
    }
    toast.success(
      result.data.invited
        ? t('users.inviteDialog.sent', { email: values.email })
        : t('users.inviteDialog.added', { email: values.email }),
    );
    close();
    router.refresh();
  });

  return (
    <>
      <Button leftIcon={<UserRoundPlus />} onClick={() => setOpen(true)}>
        {t('users.invite')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={t('users.inviteDialog.title')}
        description={t('users.inviteDialog.description')}
        preventClose={formState.isSubmitting}
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={formState.isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="invite-user-form" loading={formState.isSubmitting}>
              {t('users.inviteDialog.submit')}
            </Button>
          </>
        }
      >
        <form id="invite-user-form" onSubmit={onSubmit} className="flex flex-col gap-4 py-1" noValidate>
          {formError ? (
            <Alert variant="danger" live>
              {formError}
            </Alert>
          ) : null}
          <FormField
            label={t('users.inviteDialog.email')}
            htmlFor="invite-email"
            error={formState.errors.email?.message}
            required
          >
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              inputMode="email"
              autoFocus
              {...register('email')}
            />
          </FormField>
          <FormField
            label={t('users.inviteDialog.name')}
            htmlFor="invite-name"
            error={formState.errors.name?.message}
            required
          >
            <Input id="invite-name" autoComplete="off" maxLength={120} {...register('name')} />
          </FormField>
          <FormField
            label={t('users.inviteDialog.role')}
            htmlFor="invite-role"
            help={t(`users.role.help.${role}`)}
            error={formState.errors.role?.message}
            required
          >
            <NativeSelect
              id="invite-role"
              options={ROLES.map((r) => ({ value: r, label: t(`common.role.${r}`) }))}
              {...register('role')}
            />
          </FormField>
          <Controller
            control={control}
            name="createAuthor"
            render={({ field }) => (
              <Checkbox
                id="invite-create-author"
                label={t('users.inviteDialog.createAuthor')}
                description={t('users.inviteDialog.createAuthorHelp')}
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v === true)}
              />
            )}
          />
        </form>
      </Dialog>
    </>
  );
}
