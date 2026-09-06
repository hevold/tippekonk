'use client';
/**
 * Generelt — name, tagline, slug (read-only), domains, locale, timezone and
 * the active flag of the current site. Saves through
 * updateSiteSettingsAction('general', …).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { Site } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { SITE_LOCALES, siteGeneralSchema, TIMEZONES } from '@/server/settings/schema';

import { DomainsInput } from './domains-input';
import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';

type FormInput = z.input<typeof siteGeneralSchema>;
type FormOutput = z.output<typeof siteGeneralSchema>;

function valuesFrom(site: Site): FormInput {
  return {
    name: site.name,
    tagline: site.tagline ?? '',
    domains: [...site.domains],
    locale: site.locale === 'nn' ? 'nn' : 'nb',
    timezone: site.timezone,
    isActive: site.isActive,
  };
}

export function GeneralSettingsForm({ site }: { site: Site }) {
  const t = useT();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(siteGeneralSchema),
    defaultValues: valuesFrom(site),
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const { save, saving } = useSettingsSave<FormInput>('general');
  useUnsavedChangesGuard(formState.isDirty);

  const onSubmit = handleSubmit(async (values) => {
    const result = await save(form, values);
    if (result.ok && result.data.section === 'general') reset(valuesFrom(result.data.site));
  });

  const timezones = TIMEZONES.includes(site.timezone as (typeof TIMEZONES)[number])
    ? [...TIMEZONES]
    : [site.timezone, ...TIMEZONES];

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.general.title')}>
      <SettingsCard title={t('settings.general.identity')}>
        <FieldGrid>
          <FormField
            label={t('settings.general.name')}
            required
            error={formState.errors.name?.message}
            help={t('settings.general.nameHelp')}
          >
            <Input {...register('name')} autoComplete="organization" />
          </FormField>
          <FormField label={t('settings.general.slug')} help={t('settings.general.slugHelp')}>
            <Input value={site.slug} readOnly disabled className="font-mono" />
          </FormField>
        </FieldGrid>
        <FormField
          label={t('settings.general.tagline')}
          error={formState.errors.tagline?.message}
          help={t('settings.general.taglineHelp')}
        >
          <Input {...register('tagline')} />
        </FormField>
      </SettingsCard>

      <SettingsCard title={t('settings.general.addresses')}>
        <Controller
          control={control}
          name="domains"
          render={({ field, fieldState }) => (
            <FormField
              label={t('settings.general.domains')}
              help={t('settings.general.domainsHelp')}
              error={
                fieldState.error?.message ??
                (fieldState.error as { root?: { message?: string } } | undefined)?.root?.message
              }
            >
              <DomainsInput
                value={field.value ?? []}
                onChange={field.onChange}
                placeholder={t('settings.general.domainsPlaceholder')}
                invalid={Boolean(fieldState.error)}
              />
            </FormField>
          )}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.general.localeAndTime')}>
        <FieldGrid>
          <FormField
            label={t('settings.general.locale')}
            help={t('settings.general.localeHelp')}
            error={formState.errors.locale?.message}
          >
            <NativeSelect
              {...register('locale')}
              options={SITE_LOCALES.map((l) => ({ value: l, label: t(`settings.general.locale.${l}`) }))}
            />
          </FormField>
          <FormField label={t('settings.general.timezone')} error={formState.errors.timezone?.message}>
            <NativeSelect
              {...register('timezone')}
              options={timezones.map((tz) => ({ value: tz, label: tz }))}
            />
          </FormField>
        </FieldGrid>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              label={t('settings.general.isActive')}
              description={t('settings.general.isActiveHelp')}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
            />
          )}
        />
      </SettingsCard>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
