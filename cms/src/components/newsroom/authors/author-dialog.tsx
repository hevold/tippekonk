'use client';
/**
 * AuthorDialog — create or edit a byline profile: name, slug, job title,
 * bio, contact details, linked user account, photo (MediaPicker) and the
 * active flag. Picking a user prefills name and e-mail when they are empty.
 */
import { ImageIcon, X } from 'lucide-react';
import { useState } from 'react';

import { MediaPicker } from '@/components/media/media-picker';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { mediaUrl } from '@/server/media/urls';
import { createAuthorAction, updateAuthorAction } from '@/server/taxonomy/actions';

import type { AuthorDto, MemberOption } from './types';

export type AuthorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  author?: AuthorDto | null;
  members: MemberOption[];
  canUpload: boolean;
};

type FormState = {
  name: string;
  slug: string;
  slugTouched: boolean;
  title: string;
  bio: string;
  email: string;
  phone: string;
  userId: string;
  imageMediaId: string | null;
  imageUrl: string | null;
  isActive: boolean;
};

function initial(author: AuthorDto | null | undefined): FormState {
  return {
    name: author?.name ?? '',
    slug: author?.slug ?? '',
    slugTouched: Boolean(author),
    title: author?.title ?? '',
    bio: author?.bio ?? '',
    email: author?.email ?? '',
    phone: author?.phone ?? '',
    userId: author?.userId ?? '',
    imageMediaId: author?.imageMediaId ?? null,
    imageUrl: author?.imageUrl ?? null,
    isActive: author?.isActive ?? true,
  };
}

export function AuthorDialog({ open, onOpenChange, author, members, canUpload }: AuthorDialogProps) {
  const t = useT();
  const [form, setForm] = useState<FormState>(() => initial(author));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const editing = Boolean(author);
  const effectiveSlug = form.slugTouched ? form.slug : slugify(form.name);

  function patch(p: Partial<FormState>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function pickUser(userId: string) {
    const member = members.find((m) => m.id === userId);
    patch({
      userId,
      name: form.name || member?.name || '',
      email: form.email || member?.email || '',
    });
  }

  async function submit() {
    setSaving(true);
    setErrors({});
    const input = {
      name: form.name,
      slug: form.slugTouched ? form.slug : '',
      title: form.title,
      bio: form.bio,
      email: form.email,
      phone: form.phone,
      userId: form.userId || null,
      imageMediaId: form.imageMediaId,
      isActive: form.isActive,
      ...(author ? { sortOrder: author.sortOrder } : {}),
    };
    const result = author
      ? await updateAuthorAction({ id: author.id, input })
      : await createAuthorAction(input);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(
      editing
        ? t('taxonomy.authors.toast.updated', { name: result.data.name })
        : t('taxonomy.authors.toast.created', { name: result.data.name }),
    );
    onOpenChange(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        preventClose={saving}
        title={editing ? t('taxonomy.authors.edit') : t('taxonomy.authors.new')}
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
          <div className="flex items-start gap-4">
            <div className="grid justify-items-center gap-2">
              <Avatar name={form.name || '?'} src={form.imageUrl} size="lg" className="size-20 text-xl" />
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leftIcon={<ImageIcon />}
                  onClick={() => setPickerOpen(true)}
                >
                  {form.imageMediaId
                    ? t('taxonomy.authors.photo.change')
                    : t('taxonomy.authors.photo.choose')}
                </Button>
                {form.imageMediaId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    leftIcon={<X />}
                    onClick={() => patch({ imageMediaId: null, imageUrl: null })}
                  >
                    {t('taxonomy.authors.photo.remove')}
                  </Button>
                ) : null}
              </div>
              {errors.imageMediaId?.[0] ? (
                <p className="text-danger text-xs">{errors.imageMediaId[0]}</p>
              ) : null}
            </div>
            <div className="grid flex-1 gap-4">
              <FormField label={t('common.name')} htmlFor="author-name" required error={errors.name?.[0]}>
                <Input
                  id="author-name"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  autoFocus
                  maxLength={120}
                />
              </FormField>
              <FormField
                label={t('taxonomy.authors.jobTitle')}
                htmlFor="author-title"
                help={t('taxonomy.authors.jobTitleHelp')}
                error={errors.title?.[0]}
              >
                <Input
                  id="author-title"
                  value={form.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  maxLength={120}
                />
              </FormField>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('taxonomy.field.slug')}
              htmlFor="author-slug"
              help={t('taxonomy.authors.slugHelp', { slug: effectiveSlug || '…' })}
              error={errors.slug?.[0]}
            >
              <Input
                id="author-slug"
                value={effectiveSlug}
                onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })}
                onBlur={() => form.slugTouched && form.slug === '' && patch({ slugTouched: false })}
                maxLength={80}
              />
            </FormField>
            <FormField
              label={t('taxonomy.authors.user')}
              htmlFor="author-user"
              help={t('taxonomy.authors.userHelp')}
              error={errors.userId?.[0]}
            >
              <NativeSelect
                id="author-user"
                value={form.userId}
                onChange={(e) => pickUser(e.target.value)}
                options={[
                  { value: '', label: t('taxonomy.authors.noUser') },
                  ...members.map((m) => ({ value: m.id, label: `${m.name} (${m.email})` })),
                ]}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('common.email')} htmlFor="author-email" error={errors.email?.[0]}>
              <Input
                id="author-email"
                type="email"
                value={form.email}
                onChange={(e) => patch({ email: e.target.value })}
                maxLength={254}
              />
            </FormField>
            <FormField label={t('taxonomy.authors.phone')} htmlFor="author-phone" error={errors.phone?.[0]}>
              <Input
                id="author-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                maxLength={40}
              />
            </FormField>
          </div>

          <FormField
            label={t('taxonomy.authors.bio')}
            htmlFor="author-bio"
            help={t('taxonomy.authors.bioHelp')}
            error={errors.bio?.[0]}
          >
            <Textarea
              id="author-bio"
              value={form.bio}
              onChange={(e) => patch({ bio: e.target.value })}
              rows={3}
              maxLength={3000}
            />
          </FormField>

          <Switch
            label={t('taxonomy.field.isActive')}
            description={t('taxonomy.authors.isActiveHelp')}
            checked={form.isActive}
            onCheckedChange={(v) => patch({ isActive: v })}
          />
        </form>
      </Dialog>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        title={t('taxonomy.authors.photo.pickerTitle')}
        canUpload={canUpload}
        canEdit={canUpload}
        onSelect={(media) => {
          patch({ imageMediaId: media.id, imageUrl: mediaUrl(media, 160) });
          setPickerOpen(false);
        }}
      />
    </>
  );
}
