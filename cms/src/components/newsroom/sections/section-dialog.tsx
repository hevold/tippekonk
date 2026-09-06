'use client';
/**
 * SectionDialog — create or edit a section: name, slug (auto-generated from
 * the name until edited; reserved public paths are flagged), parent,
 * description, colour, menu visibility, active flag and SEO fields.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { isReservedSlug } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { createSectionAction, updateSectionAction } from '@/server/taxonomy/actions';

import type { SectionDto } from './types';

export type SectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing section to edit; omit to create. */
  section?: SectionDto | null;
  /** Preselected parent when creating a child. */
  parentId?: string | null;
  /** Every section (for the parent select); descendants of `section` are excluded. */
  all: SectionDto[];
};

type FormState = {
  name: string;
  slug: string;
  slugTouched: boolean;
  parentId: string;
  description: string;
  color: string;
  showInMenu: boolean;
  isActive: boolean;
  seoTitle: string;
  seoDescription: string;
};

function initial(section: SectionDto | null | undefined, parentId: string | null | undefined): FormState {
  return {
    name: section?.name ?? '',
    slug: section?.slug ?? '',
    slugTouched: Boolean(section),
    parentId: section?.parentId ?? parentId ?? '',
    description: section?.description ?? '',
    color: section?.color ?? '',
    showInMenu: section?.showInMenu ?? true,
    isActive: section?.isActive ?? true,
    seoTitle: section?.seoTitle ?? '',
    seoDescription: section?.seoDescription ?? '',
  };
}

/** Ids of `id` and everything below it (cannot become its own parent). */
function descendantIds(all: SectionDto[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all) {
      if (s.parentId && out.has(s.parentId) && !out.has(s.id)) {
        out.add(s.id);
        grew = true;
      }
    }
  }
  return out;
}

export function SectionDialog({ open, onOpenChange, section, parentId, all }: SectionDialogProps) {
  const t = useT();
  const [form, setForm] = useState<FormState>(() => initial(section, parentId));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const editing = Boolean(section);
  const excluded = section ? descendantIds(all, section.id) : new Set<string>();
  const effectiveSlug = form.slugTouched ? form.slug : slugify(form.name);
  const reserved = effectiveSlug ? isReservedSlug(effectiveSlug) : false;

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function submit() {
    setSaving(true);
    setErrors({});
    const input = {
      name: form.name,
      slug: form.slugTouched ? form.slug : '',
      parentId: form.parentId || null,
      description: form.description,
      color: form.color,
      showInMenu: form.showInMenu,
      isActive: form.isActive,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      ...(section ? { sortOrder: section.sortOrder } : {}),
    };
    const result = section ? await updateSectionAction({ id: section.id, input }) : await createSectionAction(input);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(editing ? t('taxonomy.sections.toast.updated', { name: result.data.name }) : t('taxonomy.sections.toast.created', { name: result.data.name }));
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title={editing ? t('taxonomy.sections.edit') : t('taxonomy.sections.new')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.name')} htmlFor="section-name" required error={errors.name?.[0]}>
            <Input id="section-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} autoFocus maxLength={80} />
          </FormField>
          <FormField
            label={t('taxonomy.field.slug')}
            htmlFor="section-slug"
            help={reserved ? t('taxonomy.field.slugReserved') : t('taxonomy.sections.slugHelp', { slug: effectiveSlug || '…' })}
            error={errors.slug?.[0]}
          >
            <Input
              id="section-slug"
              value={effectiveSlug}
              invalid={reserved}
              onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })}
              onBlur={() => form.slugTouched && form.slug === '' && patch({ slugTouched: false })}
              maxLength={80}
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('taxonomy.sections.parent')} htmlFor="section-parent" error={errors.parentId?.[0]}>
            <NativeSelect
              id="section-parent"
              value={form.parentId}
              onChange={(e) => patch({ parentId: e.target.value })}
              placeholder={t('taxonomy.sections.noParent')}
              options={all.filter((s) => !excluded.has(s.id)).map((s) => ({ value: s.id, label: s.parentId ? `– ${s.name}` : s.name }))}
            />
          </FormField>
          <FormField label={t('taxonomy.sections.color')} htmlFor="section-color" help={t('taxonomy.sections.colorHelp')} error={errors.color?.[0]}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t('taxonomy.sections.colorPicker')}
                value={/^#[0-9a-fA-F]{6}$/.test(form.color) ? form.color : '#1d4ed8'}
                onChange={(e) => patch({ color: e.target.value })}
                className="border-border h-9 w-12 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <Input id="section-color" value={form.color} placeholder="#1d4ed8" onChange={(e) => patch({ color: e.target.value })} maxLength={7} />
            </div>
          </FormField>
        </div>
        <FormField label={t('common.description')} htmlFor="section-description" error={errors.description?.[0]}>
          <Textarea id="section-description" value={form.description} onChange={(e) => patch({ description: e.target.value })} rows={2} maxLength={1000} />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2">
          <Switch label={t('taxonomy.sections.showInMenu')} description={t('taxonomy.sections.showInMenuHelp')} checked={form.showInMenu} onCheckedChange={(v) => patch({ showInMenu: v })} />
          <Switch label={t('taxonomy.field.isActive')} description={t('taxonomy.sections.isActiveHelp')} checked={form.isActive} onCheckedChange={(v) => patch({ isActive: v })} />
        </div>
        <fieldset className="border-border grid gap-4 rounded-md border p-3">
          <legend className="text-muted px-1 text-xs font-medium">{t('taxonomy.seo')}</legend>
          <FormField label={t('taxonomy.seoTitle')} htmlFor="section-seo-title" error={errors.seoTitle?.[0]}>
            <Input id="section-seo-title" value={form.seoTitle} onChange={(e) => patch({ seoTitle: e.target.value })} maxLength={120} />
          </FormField>
          <FormField label={t('taxonomy.seoDescription')} htmlFor="section-seo-description" error={errors.seoDescription?.[0]}>
            <Textarea id="section-seo-description" value={form.seoDescription} onChange={(e) => patch({ seoDescription: e.target.value })} rows={2} maxLength={320} />
          </FormField>
        </fieldset>
      </form>
    </Dialog>
  );
}
