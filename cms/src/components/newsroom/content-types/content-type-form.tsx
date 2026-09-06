'use client';
/**
 * ContentTypeForm — create/edit page body for a content type: key (generated
 * from the name, immutable after creation), name, description, icon,
 * template, default/active flags and the <FieldDefEditor>. Validates with
 * contentTypeInputSchema before calling the server action so field errors
 * land next to the right control.
 */
import { Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FieldDefEditor } from '@/components/forms/field-def-editor';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import type { FieldDef } from '@/lib/validation/site';
import { CONTENT_TYPE_TEMPLATES, contentTypeInputSchema } from '@/lib/validation/taxonomy';
import { createContentTypeAction, updateContentTypeAction } from '@/server/content-types/actions';

import { CONTENT_TYPE_ICON_NAMES, ContentTypeIcon } from './icons';
import type { ContentTypeDto } from './types';

export type ContentTypeFormProps = {
  contentType?: ContentTypeDto | null;
};

/** "Nekrolog" → "nekrolog"; "Leserbrev & debatt" → "leserbrev-og-debatt". */
function keyFromName(name: string): string {
  const key = name
    .toLowerCase()
    .replace(/[æ]/g, 'ae')
    .replace(/[ø]/g, 'o')
    .replace(/[å]/g, 'a')
    .replace(/&/g, ' og ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : key ? `t-${key}`.slice(0, 40) : '';
}

/** Zod issue paths → { 'fields.0.key': [...] } style map plus a nested map for the field editor. */
function splitErrors(all: Record<string, string[]>): {
  form: Record<string, string[]>;
  fields: Record<string, string[]>;
} {
  const form: Record<string, string[]> = {};
  const fields: Record<string, string[]> = {};
  for (const [path, messages] of Object.entries(all)) {
    if (path.startsWith('fields.')) fields[path.slice('fields.'.length)] = messages;
    else form[path] = messages;
  }
  return { form, fields };
}

export function ContentTypeForm({ contentType }: ContentTypeFormProps) {
  const t = useT();
  const router = useRouter();
  const editing = Boolean(contentType);
  const [name, setName] = useState(contentType?.name ?? '');
  const [key, setKey] = useState(contentType?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(Boolean(contentType));
  const [description, setDescription] = useState(contentType?.description ?? '');
  const [icon, setIcon] = useState(contentType?.icon ?? 'FileText');
  const [template, setTemplate] = useState(contentType?.template ?? 'article');
  const [isDefault, setIsDefault] = useState(contentType?.isDefault ?? false);
  const [isActive, setIsActive] = useState(contentType?.isActive ?? true);
  const [fields, setFields] = useState<FieldDef[]>(contentType?.fields ?? []);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const effectiveKey = keyTouched ? key : keyFromName(name);
  const { form: formErrors, fields: fieldErrors } = splitErrors(errors);

  async function submit() {
    const input = {
      key: effectiveKey,
      name,
      description,
      icon,
      template,
      fields,
      isDefault,
      isActive,
      ...(contentType ? { sortOrder: contentType.sortOrder } : {}),
    };
    const parsed = contentTypeInputSchema.safeParse(input);
    if (!parsed.success) {
      const map: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.length ? issue.path.map(String).join('.') : '_';
        (map[path] ??= []).push(issue.message);
      }
      setErrors(map);
      toast.error(t('common.error.validation'));
      return;
    }
    setSaving(true);
    setErrors({});
    const result = contentType
      ? await updateContentTypeAction({ id: contentType.id, input: parsed.data })
      : await createContentTypeAction(parsed.data);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error);
      return;
    }
    toast.success(
      editing
        ? t('contentTypes.toast.updated', { name: result.data.name })
        : t('contentTypes.toast.created', { name: result.data.name }),
    );
    if (!contentType) router.push(`${adminPaths.contentTypes()}/${result.data.id}`);
    else router.refresh();
  }

  const generalError = formErrors._?.[0];

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {generalError ? <Alert variant="danger">{generalError}</Alert> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('contentTypes.form.general')}</CardTitle>
              <CardDescription>{t('contentTypes.form.generalHelp')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label={t('common.name')} htmlFor="ct-name" required error={formErrors.name?.[0]}>
                  <Input
                    id="ct-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoFocus={!editing}
                    maxLength={80}
                  />
                </FormField>
                <FormField
                  label={t('contentTypes.form.key')}
                  htmlFor="ct-key"
                  required
                  help={editing ? t('contentTypes.form.keyLocked') : t('contentTypes.form.keyHelp')}
                  error={formErrors.key?.[0]}
                >
                  <Input
                    id="ct-key"
                    value={effectiveKey}
                    readOnly={editing}
                    disabled={editing}
                    className="font-mono"
                    onChange={(e) => {
                      setKey(e.target.value.toLowerCase());
                      setKeyTouched(true);
                    }}
                    onBlur={() => keyTouched && key === '' && setKeyTouched(false)}
                    maxLength={40}
                  />
                </FormField>
              </div>
              <FormField
                label={t('common.description')}
                htmlFor="ct-description"
                help={t('contentTypes.form.descriptionHelp')}
                error={formErrors.description?.[0]}
              >
                <Textarea
                  id="ct-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('contentTypes.form.fields')}</CardTitle>
              <CardDescription>{t('contentTypes.form.fieldsHelp')}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldDefEditor value={fields} onChange={setFields} errors={fieldErrors} disabled={saving} />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('contentTypes.form.presentation')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <FormField label={t('contentTypes.form.icon')} htmlFor="ct-icon" error={formErrors.icon?.[0]}>
                <div className="flex items-center gap-2">
                  <span
                    className="border-border bg-surface-2 text-muted inline-flex size-9 shrink-0 items-center justify-center rounded-md border [&_svg]:size-5"
                    aria-hidden
                  >
                    <ContentTypeIcon name={icon} />
                  </span>
                  <NativeSelect
                    id="ct-icon"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    options={CONTENT_TYPE_ICON_NAMES.map((n) => ({ value: n, label: n }))}
                  />
                </div>
              </FormField>
              <FormField
                label={t('contentTypes.form.template')}
                htmlFor="ct-template"
                help={t('contentTypes.form.templateHelp')}
                error={formErrors.template?.[0]}
              >
                <NativeSelect
                  id="ct-template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  options={CONTENT_TYPE_TEMPLATES.map((tpl) => ({
                    value: tpl,
                    label: t(`contentTypes.template.${tpl}`),
                  }))}
                />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('contentTypes.form.flags')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Switch
                label={t('contentTypes.form.isDefault')}
                description={t('contentTypes.form.isDefaultHelp')}
                checked={isDefault}
                disabled={contentType?.isDefault === true}
                onCheckedChange={(v) => {
                  setIsDefault(v);
                  if (v) setIsActive(true);
                }}
              />
              {formErrors.isDefault?.[0] ? (
                <p className="text-danger text-xs">{formErrors.isDefault[0]}</p>
              ) : null}
              <Switch
                label={t('contentTypes.form.isActive')}
                description={t('contentTypes.form.isActiveHelp')}
                checked={isActive}
                disabled={isDefault}
                onCheckedChange={setIsActive}
              />
              {formErrors.isActive?.[0] ? (
                <p className="text-danger text-xs">{formErrors.isActive[0]}</p>
              ) : null}
            </CardContent>
          </Card>

          {contentType ? (
            <Alert variant="info" title={t('contentTypes.form.usage', { count: contentType.articleCount })}>
              {t('contentTypes.form.usageHelp')}
            </Alert>
          ) : null}
        </div>
      </div>

      <div className="border-border bg-surface sticky bottom-0 -mx-1 flex items-center justify-end gap-2 border-t px-1 py-3">
        <Button asChild variant="outline" disabled={saving}>
          <Link href={adminPaths.contentTypes()}>{t('common.cancel')}</Link>
        </Button>
        <Button type="submit" loading={saving} leftIcon={<Save />}>
          {editing ? t('common.save') : t('contentTypes.form.create')}
        </Button>
      </div>
    </form>
  );
}
