'use client';
/**
 * TagDialog — create or edit a tag: name, slug (generated from the name
 * until edited) and description.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { createTagAction, updateTagAction } from '@/server/taxonomy/actions';

import type { TagDto } from './types';

export type TagDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag?: TagDto | null;
};

export function TagDialog({ open, onOpenChange, tag }: TagDialogProps) {
  const t = useT();
  const [name, setName] = useState(tag?.name ?? '');
  const [slug, setSlug] = useState(tag?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(tag));
  const [description, setDescription] = useState(tag?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const editing = Boolean(tag);
  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    setSaving(true);
    setErrors({});
    const input = { name, slug: slugTouched ? slug : '', description };
    const result = tag ? await updateTagAction({ id: tag.id, input }) : await createTagAction(input);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(
      editing
        ? t('taxonomy.tags.toast.updated', { name: result.data.name })
        : t('taxonomy.tags.toast.created', { name: result.data.name }),
    );
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      preventClose={saving}
      title={editing ? t('taxonomy.tags.edit') : t('taxonomy.tags.new')}
      size="md"
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
        <FormField label={t('common.name')} htmlFor="tag-name" required error={errors.name?.[0]}>
          <Input
            id="tag-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={80}
          />
        </FormField>
        <FormField
          label={t('taxonomy.field.slug')}
          htmlFor="tag-slug"
          help={t('taxonomy.tags.slugHelp', { slug: effectiveSlug || '…' })}
          error={errors.slug?.[0]}
        >
          <Input
            id="tag-slug"
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugTouched(true);
            }}
            onBlur={() => slugTouched && slug === '' && setSlugTouched(false)}
            maxLength={80}
          />
        </FormField>
        <FormField label={t('common.description')} htmlFor="tag-description" error={errors.description?.[0]}>
          <Textarea
            id="tag-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
