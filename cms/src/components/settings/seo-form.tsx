'use client';
/**
 * SEO — title suffix, default description, OG image and X handle, with a
 * small search-result preview.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import { seoSectionSchema, type SeoSectionInput, type SeoSectionOutput } from '@/server/settings/schema';

import { MediaField } from './media-field';
import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';

function valuesFrom(s: SiteSettings): SeoSectionInput {
  return { seo: { ...s.seo, ogImageMediaId: s.seo.ogImageMediaId ?? '' } };
}

export function SeoSettingsForm({
  settings,
  siteName,
  ogImage,
  canUpload,
}: {
  settings: SiteSettings;
  siteName: string;
  ogImage: Media | null;
  canUpload: boolean;
}) {
  const t = useT();
  const form = useForm<SeoSectionInput, unknown, SeoSectionOutput>({
    resolver: zodResolver(seoSectionSchema),
    defaultValues: valuesFrom(settings),
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const errors = formState.errors.seo;
  const { save, saving } = useSettingsSave<SeoSectionInput>('seo');
  useUnsavedChangesGuard(formState.isDirty);
  const watched = useWatch({ control, name: 'seo' });

  const onSubmit = handleSubmit(async (values) => {
    // '' clears the image (merge removes null/undefined); send null explicitly.
    const payload = { seo: { ...values.seo, ogImageMediaId: values.seo.ogImageMediaId ?? null } };
    const result = await save(form, payload);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  const suffix = watched?.titleSuffix?.trim() || `– ${siteName}`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.seo.title')}>
      <SettingsCard title={t('settings.seo.title')} description={t('settings.seo.description')}>
        <FieldGrid>
          <FormField
            label={t('settings.seo.titleSuffix')}
            help={t('settings.seo.titleSuffixHelp')}
            error={errors?.titleSuffix?.message}
          >
            <Input {...register('seo.titleSuffix')} placeholder={`– ${siteName}`} />
          </FormField>
          <FormField
            label={t('settings.seo.twitterHandle')}
            help={t('settings.seo.twitterHandleHelp')}
            error={errors?.twitterHandle?.message}
          >
            <Input {...register('seo.twitterHandle')} placeholder="@" />
          </FormField>
        </FieldGrid>
        <FormField
          label={t('settings.seo.defaultDescription')}
          help={t('settings.seo.defaultDescriptionHelp')}
          error={errors?.defaultDescription?.message}
        >
          <Textarea {...register('seo.defaultDescription')} rows={2} autoResize maxLength={320} />
        </FormField>
        <Controller
          control={control}
          name="seo.ogImageMediaId"
          render={({ field, fieldState }) => (
            <FormField
              label={t('settings.seo.ogImage')}
              help={t('settings.seo.ogImageHelp')}
              error={fieldState.error?.message}
            >
              <MediaField
                value={typeof field.value === 'string' && field.value ? field.value : null}
                initialMedia={ogImage}
                onChange={(id) => field.onChange(id ?? '')}
                canUpload={canUpload}
              />
            </FormField>
          )}
        />
      </SettingsCard>

      <SettingsCard title={t('settings.seo.preview')}>
        <div className="max-w-xl">
          <p className="text-muted text-[13px]">{siteName.toLowerCase().replace(/\s+/g, '')}.no › nyheter</p>
          <p className="truncate text-lg text-[#1a0dab] dark:text-[#8ab4f8]">
            {t('settings.theme.previewTitle')} {suffix}
          </p>
          <p className="text-muted line-clamp-2 text-sm">
            {watched?.defaultDescription?.trim() || t('settings.theme.previewLead')}
          </p>
        </div>
      </SettingsCard>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
