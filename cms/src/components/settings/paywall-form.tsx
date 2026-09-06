'use client';
/**
 * Pluss — paywall settings with a live preview of the CTA box.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import {
  paywallSectionSchema,
  type PaywallSectionInput,
  type PaywallSectionOutput,
} from '@/server/settings/schema';

import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';

function valuesFrom(s: SiteSettings): PaywallSectionInput {
  return { paywall: { ...s.paywall } };
}

export function PaywallSettingsForm({ settings }: { settings: SiteSettings }) {
  const t = useT();
  const form = useForm<PaywallSectionInput, unknown, PaywallSectionOutput>({
    resolver: zodResolver(paywallSectionSchema),
    defaultValues: valuesFrom(settings),
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const errors = formState.errors.paywall;
  const { save, saving } = useSettingsSave<PaywallSectionInput>('paywall');
  useUnsavedChangesGuard(formState.isDirty);
  const preview = useWatch({ control, name: 'paywall' });

  const onSubmit = handleSubmit(async (values) => {
    const result = await save(form, values);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.paywall.title')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-6">
          <SettingsCard title={t('settings.paywall.title')}>
            <Controller
              control={control}
              name="paywall.enabled"
              render={({ field }) => (
                <Switch
                  label={t('settings.paywall.enabled')}
                  description={t('settings.paywall.enabledHelp')}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldGrid>
              <FormField
                label={t('settings.paywall.label')}
                help={t('settings.paywall.labelHelp')}
                error={errors?.label?.message}
              >
                <Input {...register('paywall.label')} maxLength={20} />
              </FormField>
              <FormField
                label={t('settings.paywall.teaserParagraphs')}
                help={t('settings.paywall.teaserParagraphsHelp')}
                error={errors?.teaserParagraphs?.message}
              >
                <Input
                  {...register('paywall.teaserParagraphs', { valueAsNumber: true })}
                  type="number"
                  min={0}
                  max={10}
                />
              </FormField>
            </FieldGrid>
          </SettingsCard>

          <SettingsCard title={t('settings.paywall.cta')}>
            <FormField label={t('settings.paywall.ctaTitle')} error={errors?.ctaTitle?.message}>
              <Input {...register('paywall.ctaTitle')} />
            </FormField>
            <FormField label={t('settings.paywall.ctaText')} error={errors?.ctaText?.message}>
              <Textarea {...register('paywall.ctaText')} rows={2} autoResize />
            </FormField>
            <FieldGrid>
              <FormField label={t('settings.paywall.ctaButton')} error={errors?.ctaButton?.message}>
                <Input {...register('paywall.ctaButton')} />
              </FormField>
              <FormField
                label={t('settings.paywall.ctaUrl')}
                help={t('settings.paywall.ctaUrlHelp')}
                error={errors?.ctaUrl?.message}
              >
                <Input {...register('paywall.ctaUrl')} inputMode="url" />
              </FormField>
            </FieldGrid>
            <FormField
              label={t('settings.paywall.loginUrl')}
              help={t('settings.paywall.loginUrlHelp')}
              error={errors?.loginUrl?.message}
            >
              <Input {...register('paywall.loginUrl')} inputMode="url" placeholder="https://" />
            </FormField>
          </SettingsCard>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start" aria-label={t('settings.paywall.preview')}>
          <p className="text-muted mb-2 text-[13px] font-medium">{t('settings.paywall.preview')}</p>
          <div className="border-border bg-surface rounded-lg border p-5 text-center shadow-xs">
            <Badge variant="warning" className="mb-3">
              {preview?.label || 'Pluss'}
            </Badge>
            <p className="text-text font-serif text-lg font-semibold">{preview?.ctaTitle}</p>
            <p className="text-muted mt-1 text-sm">{preview?.ctaText}</p>
            <span className="bg-primary text-primary-foreground mt-4 inline-flex h-9 items-center rounded-md px-4 text-sm font-medium">
              {preview?.ctaButton}
            </span>
            {preview?.loginUrl ? (
              <p className="text-primary mt-3 text-[13px] underline underline-offset-2">
                {t('settings.paywall.previewLogin')}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
