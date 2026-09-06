'use client';
/**
 * Analyse — Plausible, Umami or Matomo configuration with an explanation of
 * each provider and a privacy note. Which provider is active is derived from
 * which fields are filled in.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import {
  analyticsSectionSchema,
  type AnalyticsSectionInput,
  type AnalyticsSectionOutput,
} from '@/server/settings/schema';

import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';

function valuesFrom(s: SiteSettings): AnalyticsSectionInput {
  return { analytics: { ...s.analytics } };
}

export function AnalyticsSettingsForm({ settings }: { settings: SiteSettings }) {
  const t = useT();
  const form = useForm<AnalyticsSectionInput, unknown, AnalyticsSectionOutput>({
    resolver: zodResolver(analyticsSectionSchema),
    defaultValues: valuesFrom(settings),
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const errors = formState.errors.analytics;
  const { save, saving } = useSettingsSave<AnalyticsSectionInput>('analytics');
  useUnsavedChangesGuard(formState.isDirty);
  const a = useWatch({ control, name: 'analytics' });

  const plausibleActive = Boolean(a?.plausibleDomain?.trim());
  const umamiActive = Boolean(a?.umamiScriptUrl?.trim() && a?.umamiWebsiteId?.trim());
  const matomoActive = Boolean(a?.matomoUrl?.trim() && a?.matomoSiteId?.trim());
  const anyActive = plausibleActive || umamiActive || matomoActive;

  const status = (active: boolean) => (
    <Badge variant={active ? 'success' : 'muted'}>
      {active ? t('settings.analytics.active') : t('settings.analytics.inactive')}
    </Badge>
  );

  const onSubmit = handleSubmit(async (values) => {
    const result = await save(form, values);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.analytics.title')}>
      <Alert variant="info" title={t('settings.analytics.privacyTitle')}>
        {t('settings.analytics.privacy')}
      </Alert>
      {!anyActive ? <p className="text-muted text-sm">{t('settings.analytics.none')}</p> : null}

      <SettingsCard
        title={t('settings.analytics.plausible')}
        description={t('settings.analytics.plausibleHelp')}
        actions={status(plausibleActive)}
      >
        <FormField
          label={t('settings.analytics.plausibleDomain')}
          error={errors?.plausibleDomain?.message}
          className="max-w-md"
        >
          <Input {...register('analytics.plausibleDomain')} placeholder="avisa.no" spellCheck={false} />
        </FormField>
      </SettingsCard>

      <SettingsCard
        title={t('settings.analytics.umami')}
        description={t('settings.analytics.umamiHelp')}
        actions={status(umamiActive)}
      >
        <FieldGrid>
          <FormField label={t('settings.analytics.umamiScriptUrl')} error={errors?.umamiScriptUrl?.message}>
            <Input
              {...register('analytics.umamiScriptUrl')}
              type="url"
              inputMode="url"
              placeholder="https://umami.avisa.no/script.js"
            />
          </FormField>
          <FormField label={t('settings.analytics.umamiWebsiteId')} error={errors?.umamiWebsiteId?.message}>
            <Input {...register('analytics.umamiWebsiteId')} spellCheck={false} className="font-mono" />
          </FormField>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard
        title={t('settings.analytics.matomo')}
        description={t('settings.analytics.matomoHelp')}
        actions={status(matomoActive)}
      >
        <FieldGrid>
          <FormField label={t('settings.analytics.matomoUrl')} error={errors?.matomoUrl?.message}>
            <Input
              {...register('analytics.matomoUrl')}
              type="url"
              inputMode="url"
              placeholder="https://matomo.avisa.no/"
            />
          </FormField>
          <FormField label={t('settings.analytics.matomoSiteId')} error={errors?.matomoSiteId?.message}>
            <Input {...register('analytics.matomoSiteId')} inputMode="numeric" className="font-mono" />
          </FormField>
        </FieldGrid>
      </SettingsCard>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
