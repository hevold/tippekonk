'use client';
/**
 * TaxonomyCard ("Seksjon og stikkord") — section select and a creatable tag
 * combobox. New tags are created through createTagAction and added to the
 * option list immediately.
 */
import { useState } from 'react';

import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { createTagAction } from '@/server/articles/actions';
import type { EditorSection, EditorTag } from '@/server/articles/queries';

import type { EditorFormValues } from './types';

export type TaxonomyCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  sections: EditorSection[];
  tagOptions: EditorTag[];
  errors?: Record<string, string>;
  canCreateTags: boolean;
};

function sectionLabel(section: EditorSection, all: EditorSection[]): string {
  const parent = section.parentId ? all.find((s) => s.id === section.parentId) : null;
  return parent ? `${parent.name} / ${section.name}` : section.name;
}

export function TaxonomyCard({ values, update, disabled, sections, tagOptions, errors = {}, canCreateTags }: TaxonomyCardProps) {
  const t = useT();
  const [extraTags, setExtraTags] = useState<EditorTag[]>([]);
  const allTags = [...tagOptions, ...extraTags.filter((e) => !tagOptions.some((o) => o.id === e.id))];
  const options: ComboboxOption[] = allTags.map((tag) => ({ value: tag.id, label: tag.name, keywords: [tag.slug] }));

  const sectionOptions = sections
    .filter((s) => s.isActive || s.id === values.sectionId)
    .map((s) => ({ value: s.id, label: sectionLabel(s, sections) + (s.isActive ? '' : ` (${t('articles.taxonomy.inactive')})`) }));

  async function createTag(label: string) {
    const res = await createTagAction(label);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setExtraTags((prev) => [...prev, res.data]);
    if (!values.tagIds.includes(res.data.id)) update({ tagIds: [...values.tagIds, res.data.id] });
    toast.success(t('articles.taxonomy.tagCreated', { name: res.data.name }));
  }

  return (
    <div className="grid gap-4">
      <FormField label={t('common.section')} htmlFor="article-section" required error={errors.sectionId}>
        <NativeSelect
          id="article-section"
          value={values.sectionId ?? ''}
          options={sectionOptions}
          placeholder={t('articles.taxonomy.chooseSection')}
          disabled={disabled}
          invalid={Boolean(errors.sectionId)}
          onChange={(e) => update({ sectionId: e.target.value || null })}
        />
      </FormField>
      <FormField label={t('common.tags')} htmlFor="article-tags" help={canCreateTags ? t('articles.taxonomy.tagsHelp') : undefined}>
        <Combobox
          id="article-tags"
          multiple
          options={options}
          value={values.tagIds}
          onChange={(tagIds) => update({ tagIds })}
          placeholder={t('articles.taxonomy.chooseTags')}
          searchPlaceholder={t('articles.taxonomy.searchTags')}
          creatable={canCreateTags}
          onCreate={canCreateTags ? createTag : undefined}
          disabled={disabled}
          emptyText={t('articles.taxonomy.noTags')}
        />
      </FormField>
    </div>
  );
}
