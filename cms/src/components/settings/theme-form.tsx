'use client';
/**
 * Utseende — theme colours (with contrast checks), fonts, radius, content
 * width, logo, dark mode and masthead flags, with a live preview panel.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import { mediaUrl } from '@/server/media/urls';
import {
  themeSectionSchema,
  type ThemeSectionInput,
  type ThemeSectionOutput,
} from '@/server/settings/schema';

import { ColorField } from './color-field';
import { MediaField } from './media-field';
import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';
import { ThemePreview } from './theme-preview';

function valuesFrom(s: SiteSettings): ThemeSectionInput {
  return {
    theme: { ...s.theme, logoMediaId: s.theme.logoMediaId ?? '' },
    masthead: { ...s.masthead },
  };
}

export function ThemeSettingsForm({
  settings,
  siteName,
  tagline,
  logo,
  canUpload,
}: {
  settings: SiteSettings;
  siteName: string;
  tagline: string | null;
  logo: Media | null;
  canUpload: boolean;
}) {
  const t = useT();
  const form = useForm<ThemeSectionInput, unknown, ThemeSectionOutput>({
    resolver: zodResolver(themeSectionSchema),
    defaultValues: valuesFrom(settings),
    mode: 'onChange',
  });
  const { register, control, handleSubmit, formState, reset, setValue } = form;
  const errors = formState.errors;
  const { save, saving } = useSettingsSave<ThemeSectionInput>('theme');
  useUnsavedChangesGuard(formState.isDirty);
  const theme = useWatch({ control, name: 'theme' });
  const masthead = useWatch({ control, name: 'masthead' });
  const logoUrl = logo && theme?.logoMediaId === logo.id ? mediaUrl(logo, 640) : null;

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      theme: { ...values.theme, logoMediaId: values.theme.logoMediaId ?? null },
      masthead: values.masthead,
    };
    const result = await save(form, payload);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  const background = theme?.background ?? '#ffffff';
  const text = theme?.text ?? '#111111';

  const colorField = (
    name: 'primary' | 'accent' | 'background' | 'text',
    opts: { help?: string; contrastWith?: string; contrastKind?: 'background' | 'text' },
  ) => (
    <Controller
      control={control}
      name={`theme.${name}`}
      render={({ field, fieldState }) => (
        <ColorField
          label={t(`settings.theme.${name}`)}
          help={opts.help}
          value={field.value ?? ''}
          onChange={field.onChange}
          onBlur={field.onBlur}
          name={field.name}
          error={fieldState.error?.message}
          contrastWith={opts.contrastWith}
          contrastKind={opts.contrastKind}
        />
      )}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.theme.title')}>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-6">
          <SettingsCard title={t('settings.theme.colors')} description={t('settings.theme.contrastHelp')}>
            <FieldGrid>
              {colorField('primary', { help: t('settings.theme.primaryHelp'), contrastWith: background })}
              {colorField('accent', { help: t('settings.theme.accentHelp'), contrastWith: background })}
              {colorField('background', { contrastWith: text, contrastKind: 'text' })}
              {colorField('text', { contrastWith: background })}
            </FieldGrid>
          </SettingsCard>

          <SettingsCard title={t('settings.theme.typography')}>
            <FieldGrid>
              <Controller
                control={control}
                name="theme.fontHeading"
                render={({ field }) => (
                  <FormField label={t('settings.theme.fontHeading')}>
                    <RadioGroup
                      value={field.value ?? 'serif'}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'serif', label: t('settings.theme.font.serif') },
                        { value: 'sans', label: t('settings.theme.font.sans') },
                      ]}
                    />
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="theme.fontBody"
                render={({ field }) => (
                  <FormField label={t('settings.theme.fontBody')}>
                    <RadioGroup
                      value={field.value ?? 'sans'}
                      onValueChange={field.onChange}
                      options={[
                        { value: 'sans', label: t('settings.theme.font.sans') },
                        { value: 'serif', label: t('settings.theme.font.serif') },
                      ]}
                    />
                  </FormField>
                )}
              />
              <FormField label={t('settings.theme.radius')} error={errors.theme?.radius?.message}>
                <NativeSelect
                  {...register('theme.radius')}
                  options={(['none', 'sm', 'md', 'lg'] as const).map((r) => ({
                    value: r,
                    label: t(`settings.theme.radius.${r}`),
                  }))}
                />
              </FormField>
              <FormField
                label={t('settings.theme.contentWidth')}
                help={t('settings.theme.contentWidthHelp')}
                error={errors.theme?.contentWidth?.message}
              >
                <Input
                  {...register('theme.contentWidth', { valueAsNumber: true })}
                  type="number"
                  min={960}
                  max={1600}
                  step={10}
                />
              </FormField>
              <FormField label={t('settings.theme.darkMode')} error={errors.theme?.darkMode?.message}>
                <NativeSelect
                  {...register('theme.darkMode')}
                  options={[
                    { value: 'off', label: t('settings.theme.darkMode.off') },
                    { value: 'auto', label: t('settings.theme.darkMode.auto') },
                  ]}
                />
              </FormField>
            </FieldGrid>
          </SettingsCard>

          <SettingsCard title={t('settings.theme.masthead')}>
            <Controller
              control={control}
              name="theme.logoMediaId"
              render={({ field, fieldState }) => (
                <FormField
                  label={t('settings.theme.logo')}
                  help={t('settings.theme.logoHelp')}
                  error={fieldState.error?.message}
                >
                  <MediaField
                    value={typeof field.value === 'string' && field.value ? field.value : null}
                    initialMedia={logo}
                    onChange={(id) =>
                      setValue('theme.logoMediaId', id ?? '', { shouldDirty: true, shouldValidate: true })
                    }
                    canUpload={canUpload}
                  />
                </FormField>
              )}
            />
            <div className="grid gap-4">
              {(['showTagline', 'showDate', 'showWeather'] as const).map((key) => (
                <Controller
                  key={key}
                  control={control}
                  name={`masthead.${key}`}
                  render={({ field }) => (
                    <Switch
                      label={t(`settings.theme.${key}`)}
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              ))}
            </div>
          </SettingsCard>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-muted mb-2 text-[13px] font-medium">{t('settings.theme.preview')}</p>
          <ThemePreview
            siteName={siteName}
            tagline={tagline}
            logoUrl={logoUrl}
            values={{
              primary: theme?.primary ?? '#0b3d91',
              accent: theme?.accent ?? '#d9291c',
              background,
              text,
              fontHeading: theme?.fontHeading ?? 'serif',
              fontBody: theme?.fontBody ?? 'sans',
              radius: theme?.radius ?? 'sm',
              contentWidth: Number(theme?.contentWidth) || 1200,
              showTagline: masthead?.showTagline ?? true,
              showDate: masthead?.showDate ?? true,
            }}
          />
          <p className="text-muted mt-2 text-[12px]">{t('settings.theme.previewHelp')}</p>
        </aside>
      </div>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
