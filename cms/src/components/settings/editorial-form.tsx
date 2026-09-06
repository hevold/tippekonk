'use client';
/**
 * Redaksjonelt — ansvarlig redaktør and publisher, contact and tips lines,
 * social links, editor rules (required lead/image, lengths, autosave),
 * reading display, front page, feeds and live polling. One form, one save.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, type Control, type FieldPath } from 'react-hook-form';

import { Checkbox } from '@/components/ui/checkbox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/lib/i18n/client';
import type { SiteSettings } from '@/lib/validation/site';
import {
  editorialSectionSchema,
  type EditorialSectionInput,
  type EditorialSectionOutput,
} from '@/server/settings/schema';

import {
  FieldGrid,
  SettingsCard,
  SettingsSaveBar,
  useSettingsSave,
  useUnsavedChangesGuard,
} from './settings-form';

function valuesFrom(s: SiteSettings): EditorialSectionInput {
  return {
    editorial: { ...s.editorial },
    contact: { ...s.contact },
    social: { ...s.social },
    editor: { ...s.editor },
    reading: { ...s.reading },
    frontPage: { ...s.frontPage },
    feeds: { ...s.feeds },
    live: { ...s.live },
  };
}

function BoolSwitch({
  control,
  name,
  label,
  description,
}: {
  control: Control<EditorialSectionInput>;
  name: FieldPath<EditorialSectionInput>;
  label: string;
  description?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Switch
          label={label}
          description={description}
          checked={Boolean(field.value)}
          onCheckedChange={field.onChange}
          onBlur={field.onBlur}
          name={field.name}
        />
      )}
    />
  );
}

export function EditorialSettingsForm({ settings }: { settings: SiteSettings }) {
  const t = useT();
  const form = useForm<EditorialSectionInput, unknown, EditorialSectionOutput>({
    resolver: zodResolver(editorialSectionSchema),
    defaultValues: valuesFrom(settings),
  });
  const { register, control, handleSubmit, formState, reset } = form;
  const errors = formState.errors;
  const { save, saving } = useSettingsSave<EditorialSectionInput>('editorial');
  useUnsavedChangesGuard(formState.isDirty);

  const onSubmit = handleSubmit(async (values) => {
    const result = await save(form, values);
    if (result.ok && result.data.section !== 'general') reset(valuesFrom(result.data.settings));
  });

  const num = (name: FieldPath<EditorialSectionInput>) => register(name, { valueAsNumber: true });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-label={t('settings.editorial.title')}>
      <SettingsCard title={t('settings.editorial.masthead')}>
        <FieldGrid>
          <FormField
            label={t('settings.editorial.responsibleEditor')}
            help={t('settings.editorial.responsibleEditorHelp')}
            error={errors.editorial?.responsibleEditor?.message}
          >
            <Input {...register('editorial.responsibleEditor')} />
          </FormField>
          <FormField
            label={t('settings.editorial.responsibleEditorTitle')}
            error={errors.editorial?.responsibleEditorTitle?.message}
          >
            <Input {...register('editorial.responsibleEditorTitle')} />
          </FormField>
          <FormField label={t('settings.editorial.publisher')} error={errors.editorial?.publisher?.message}>
            <Input {...register('editorial.publisher')} />
          </FormField>
          <FormField label={t('settings.editorial.orgNumber')} error={errors.editorial?.orgNumber?.message}>
            <Input {...register('editorial.orgNumber')} inputMode="numeric" />
          </FormField>
        </FieldGrid>
        <BoolSwitch
          control={control}
          name="editorial.showPressEthicsStatement"
          label={t('settings.editorial.showPressEthicsStatement')}
          description={t('settings.editorial.showPressEthicsStatementHelp')}
        />
        <FormField
          label={t('settings.editorial.pressEthicsStatement')}
          error={errors.editorial?.pressEthicsStatement?.message}
        >
          <Textarea {...register('editorial.pressEthicsStatement')} rows={3} autoResize />
        </FormField>
        <FormField
          label={t('settings.editorial.editorialPolicyUrl')}
          error={errors.editorial?.editorialPolicyUrl?.message}
        >
          <Input
            {...register('editorial.editorialPolicyUrl')}
            type="url"
            inputMode="url"
            placeholder="https://"
          />
        </FormField>
      </SettingsCard>

      <SettingsCard title={t('settings.editorial.contact')}>
        <FieldGrid>
          <FormField label={t('settings.editorial.address')} error={errors.contact?.address?.message}>
            <Input {...register('contact.address')} autoComplete="street-address" />
          </FormField>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <FormField label={t('settings.editorial.postalCode')} error={errors.contact?.postalCode?.message}>
              <Input {...register('contact.postalCode')} inputMode="numeric" autoComplete="postal-code" />
            </FormField>
            <FormField label={t('settings.editorial.city')} error={errors.contact?.city?.message}>
              <Input {...register('contact.city')} autoComplete="address-level2" />
            </FormField>
          </div>
          <FormField label={t('settings.editorial.email')} error={errors.contact?.email?.message}>
            <Input {...register('contact.email')} type="email" inputMode="email" />
          </FormField>
          <FormField label={t('settings.editorial.phone')} error={errors.contact?.phone?.message}>
            <Input {...register('contact.phone')} type="tel" inputMode="tel" />
          </FormField>
          <FormField label={t('settings.editorial.tipsEmail')} error={errors.contact?.tipsEmail?.message}>
            <Input {...register('contact.tipsEmail')} type="email" inputMode="email" />
          </FormField>
          <FormField label={t('settings.editorial.tipsPhone')} error={errors.contact?.tipsPhone?.message}>
            <Input {...register('contact.tipsPhone')} type="tel" inputMode="tel" />
          </FormField>
        </FieldGrid>
        <FormField
          label={t('settings.editorial.secureTipsUrl')}
          help={t('settings.editorial.secureTipsUrlHelp')}
          error={errors.contact?.secureTipsUrl?.message}
        >
          <Input {...register('contact.secureTipsUrl')} />
        </FormField>
      </SettingsCard>

      <SettingsCard title={t('settings.editorial.social')} description={t('settings.editorial.socialHelp')}>
        <FieldGrid>
          {(['facebook', 'instagram', 'x', 'youtube', 'tiktok', 'bluesky'] as const).map((key) => (
            <FormField key={key} label={t(`settings.editorial.${key}`)} error={errors.social?.[key]?.message}>
              <Input {...register(`social.${key}`)} type="url" inputMode="url" placeholder="https://" />
            </FormField>
          ))}
        </FieldGrid>
      </SettingsCard>

      <SettingsCard title={t('settings.editorial.editor')}>
        <div className="grid gap-3">
          <Controller
            control={control}
            name="editor.requireFeaturedImage"
            render={({ field }) => (
              <Checkbox
                label={t('settings.editorial.requireFeaturedImage')}
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
              />
            )}
          />
          <Controller
            control={control}
            name="editor.requireLead"
            render={({ field }) => (
              <Checkbox
                label={t('settings.editorial.requireLead')}
                checked={Boolean(field.value)}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
              />
            )}
          />
        </div>
        <FieldGrid className="md:grid-cols-3">
          <FormField
            label={t('settings.editorial.titleMaxLength')}
            help={t('settings.editorial.titleMaxLengthHelp')}
            error={errors.editor?.titleMaxLength?.message}
          >
            <Input {...num('editor.titleMaxLength')} type="number" min={20} max={200} />
          </FormField>
          <FormField
            label={t('settings.editorial.leadMaxLength')}
            help={t('settings.editorial.characters')}
            error={errors.editor?.leadMaxLength?.message}
          >
            <Input {...num('editor.leadMaxLength')} type="number" min={50} max={600} />
          </FormField>
          <FormField
            label={t('settings.editorial.autosaveIntervalSec')}
            help={t('settings.editorial.seconds')}
            error={errors.editor?.autosaveIntervalSec?.message}
          >
            <Input {...num('editor.autosaveIntervalSec')} type="number" min={5} max={120} />
          </FormField>
        </FieldGrid>
      </SettingsCard>

      <SettingsCard title={t('settings.editorial.reading')}>
        <div className="grid gap-4">
          <BoolSwitch
            control={control}
            name="reading.showReadingTime"
            label={t('settings.editorial.showReadingTime')}
          />
          <BoolSwitch
            control={control}
            name="reading.showUpdatedAt"
            label={t('settings.editorial.showUpdatedAt')}
          />
          <BoolSwitch
            control={control}
            name="reading.showWordCount"
            label={t('settings.editorial.showWordCount')}
          />
        </div>
      </SettingsCard>

      <FieldGrid>
        <SettingsCard title={t('settings.editorial.frontPage')}>
          <BoolSwitch
            control={control}
            name="frontPage.breakingBar"
            label={t('settings.editorial.breakingBar')}
          />
          <FormField
            label={t('settings.editorial.latestCount')}
            error={errors.frontPage?.latestCount?.message}
          >
            <Input {...num('frontPage.latestCount')} type="number" min={0} max={50} />
          </FormField>
        </SettingsCard>
        <SettingsCard title={t('settings.editorial.feeds')}>
          <BoolSwitch
            control={control}
            name="feeds.fullContent"
            label={t('settings.editorial.fullContent')}
            description={t('settings.editorial.fullContentHelp')}
          />
          <FormField label={t('settings.editorial.itemCount')} error={errors.feeds?.itemCount?.message}>
            <Input {...num('feeds.itemCount')} type="number" min={1} max={100} />
          </FormField>
        </SettingsCard>
      </FieldGrid>

      <SettingsCard title={t('settings.editorial.live')}>
        <FormField
          label={t('settings.editorial.pollIntervalSec')}
          help={t('settings.editorial.seconds')}
          error={errors.live?.pollIntervalSec?.message}
          className="max-w-xs"
        >
          <Input {...num('live.pollIntervalSec')} type="number" min={5} max={300} />
        </FormField>
      </SettingsCard>

      <SettingsSaveBar dirty={formState.isDirty} saving={saving} onDiscard={() => reset()} />
    </form>
  );
}
