'use client';
/**
 * MenuItemDialog — add or edit one menu item. Three kinds: a section link
 * (pick a section; label and href follow), a tag link, or a custom link
 * (label, href, open in new tab). Stored form is always { label, href, target }.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup } from '@/components/ui/radio-group';
import { publicPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { hrefSchema } from '@/lib/validation/common';
import type { MenuItem } from '@/lib/validation/site';

export type MenuSectionOption = { id: string; name: string; slug: string; parentId: string | null };
export type MenuTagOption = { id: string; name: string; slug: string };

const formSchema = z
  .object({
    kind: z.enum(['section', 'tag', 'custom']),
    sectionSlug: z.string(),
    tagSlug: z.string(),
    label: z.string().trim().min(1, 'Teksten må fylles ut').max(80, 'Maks 80 tegn'),
    href: z.string().trim(),
    newTab: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'section' && !v.sectionSlug)
      ctx.addIssue({ code: 'custom', path: ['sectionSlug'], message: 'Velg en seksjon' });
    if (v.kind === 'tag' && !v.tagSlug)
      ctx.addIssue({ code: 'custom', path: ['tagSlug'], message: 'Velg et stikkord' });
    if (v.kind === 'custom') {
      const parsed = hrefSchema.pipe(z.string().min(1, 'Lenken må fylles ut')).safeParse(v.href);
      if (!parsed.success)
        ctx.addIssue({
          code: 'custom',
          path: ['href'],
          message: parsed.error.issues[0]?.message ?? 'Ugyldig lenke',
        });
    }
  });
type FormValues = z.infer<typeof formSchema>;

export type MenuItemDraft = Pick<MenuItem, 'label' | 'href' | 'target'>;

function inferKind(
  item: MenuItemDraft | null,
  sections: MenuSectionOption[],
  tags: MenuTagOption[],
): FormValues {
  if (!item)
    return {
      kind: 'section',
      sectionSlug: sections[0]?.slug ?? '',
      tagSlug: tags[0]?.slug ?? '',
      label: '',
      href: '',
      newTab: false,
    };
  const section = sections.find((s) => publicPaths.section(s.slug) === item.href);
  if (section)
    return {
      kind: 'section',
      sectionSlug: section.slug,
      tagSlug: '',
      label: item.label,
      href: item.href,
      newTab: item.target === '_blank',
    };
  const tag = tags.find((tg) => publicPaths.tag(tg.slug) === item.href);
  if (tag)
    return {
      kind: 'tag',
      sectionSlug: '',
      tagSlug: tag.slug,
      label: item.label,
      href: item.href,
      newTab: item.target === '_blank',
    };
  return {
    kind: 'custom',
    sectionSlug: '',
    tagSlug: '',
    label: item.label,
    href: item.href,
    newTab: item.target === '_blank',
  };
}

export function MenuItemDialog({
  open,
  onOpenChange,
  item,
  sections,
  tags,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = new item */
  item: MenuItemDraft | null;
  sections: MenuSectionOption[];
  tags: MenuTagOption[];
  onSubmit: (draft: MenuItemDraft) => void;
}) {
  const t = useT();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: inferKind(item, sections, tags),
  });
  const { register, control, handleSubmit, formState, reset, setValue, getValues } = form;
  const kind = useWatch({ control, name: 'kind' });
  const sectionSlug = useWatch({ control, name: 'sectionSlug' });
  const tagSlug = useWatch({ control, name: 'tagSlug' });

  useEffect(() => {
    if (open) reset(inferKind(item, sections, tags));
  }, [open, item, sections, tags, reset]);

  // Keep the label in sync with the chosen section/tag until the user edits it.
  useEffect(() => {
    if (kind === 'section') {
      const s = sections.find((x) => x.slug === sectionSlug);
      if (s && (!getValues('label') || sections.some((x) => x.name === getValues('label'))))
        setValue('label', s.name);
    } else if (kind === 'tag') {
      const tg = tags.find((x) => x.slug === tagSlug);
      if (tg && (!getValues('label') || tags.some((x) => x.name === getValues('label'))))
        setValue('label', tg.name);
    }
  }, [kind, sectionSlug, tagSlug, sections, tags, getValues, setValue]);

  const submit = handleSubmit((values) => {
    const href =
      values.kind === 'section'
        ? publicPaths.section(values.sectionSlug)
        : values.kind === 'tag'
          ? publicPaths.tag(values.tagSlug)
          : values.href;
    onSubmit({ label: values.label, href, ...(values.newTab ? { target: '_blank' as const } : {}) });
    onOpenChange(false);
  });

  const sectionOptions = sections.map((s) => {
    const parent = s.parentId ? sections.find((p) => p.id === s.parentId) : null;
    return { value: s.slug, label: parent ? `${parent.name} › ${s.name}` : s.name };
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? t('settings.menus.editItem') : t('settings.menus.newItem')}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()}>{item ? t('common.save') : t('common.create')}</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="grid gap-4"
        noValidate
      >
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <FormField group label={t('settings.menus.type')}>
              <RadioGroup
                inline
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  {
                    value: 'section',
                    label: t('settings.menus.type.section'),
                    disabled: sections.length === 0,
                  },
                  { value: 'tag', label: t('settings.menus.type.tag'), disabled: tags.length === 0 },
                  { value: 'custom', label: t('settings.menus.type.custom') },
                ]}
              />
            </FormField>
          )}
        />
        {kind === 'section' ? (
          <FormField
            label={t('settings.menus.section')}
            required
            error={formState.errors.sectionSlug?.message}
          >
            <NativeSelect
              {...register('sectionSlug')}
              options={sectionOptions}
              placeholder={
                sections.length === 0 ? t('settings.menus.noSections') : t('settings.menus.selectSection')
              }
            />
          </FormField>
        ) : null}
        {kind === 'tag' ? (
          <FormField label={t('settings.menus.tag')} required error={formState.errors.tagSlug?.message}>
            <NativeSelect
              {...register('tagSlug')}
              options={tags.map((tg) => ({ value: tg.slug, label: tg.name }))}
              placeholder={tags.length === 0 ? t('settings.menus.noTags') : t('settings.menus.selectTag')}
            />
          </FormField>
        ) : null}
        <FormField label={t('settings.menus.label')} required error={formState.errors.label?.message}>
          <Input {...register('label')} maxLength={80} autoFocus={kind === 'custom'} />
        </FormField>
        {kind === 'custom' ? (
          <FormField
            label={t('settings.menus.href')}
            required
            help={t('settings.menus.hrefHelp')}
            error={formState.errors.href?.message}
          >
            <Input {...register('href')} placeholder="/om" inputMode="url" spellCheck={false} />
          </FormField>
        ) : null}
        <Controller
          control={control}
          name="newTab"
          render={({ field }) => (
            <Checkbox
              label={t('settings.menus.newTab')}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
      </form>
    </Dialog>
  );
}
