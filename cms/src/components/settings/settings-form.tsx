'use client';
/**
 * Shared scaffolding for the settings forms: a sticky save bar with an
 * "unsaved changes" indicator, a navigation guard while the form is dirty,
 * a helper that maps ActionResult field errors onto react-hook-form, and
 * the one save hook every section page uses (`updateSiteSettingsAction`).
 */
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/server/actions';
import { updateSiteSettingsAction, type SettingsSaveResult } from '@/server/settings/actions';
import type { SettingsSection } from '@/server/settings/schema';

/** Warn before leaving the page (reload, close, or an in-app link) while `dirty`. */
export function useUnsavedChangesGuard(dirty: boolean): void {
  const t = useT();
  const message = t('settings.form.unsavedWarning');
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
        return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      if (
        href.startsWith('#') ||
        anchor.getAttribute('target') === '_blank' ||
        anchor.hasAttribute('download')
      )
        return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, message]);
}

/** Copy `{ 'theme.primary': ['msg'] }` style errors from an action onto the form. */
export function applyFieldErrors<T extends FieldValues>(
  form: UseFormReturn<T, unknown, FieldValues>,
  fieldErrors: Record<string, string[]> | undefined,
): void {
  if (!fieldErrors) return;
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (key === '_') continue;
    form.setError(key as Path<T>, { type: 'server', message: messages[0] });
  }
}

/**
 * Save one settings section. Returns the result so the caller can reset the
 * form with the persisted values; shows the toast and maps field errors.
 */
export function useSettingsSave<T extends FieldValues>(section: SettingsSection) {
  const t = useT();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      form: UseFormReturn<T, unknown, FieldValues>,
      payload: Record<string, unknown>,
    ): Promise<ActionResult<SettingsSaveResult>> => {
      setSaving(true);
      try {
        const result = await updateSiteSettingsAction(section, payload);
        if (!result.ok) {
          applyFieldErrors(form, result.fieldErrors);
          toast.error(result.error || t('settings.form.error'));
          return result;
        }
        toast.success(
          result.data.changed.length > 0 ? t('settings.form.savedToast') : t('settings.form.noChanges'),
        );
        router.refresh();
        return result;
      } finally {
        setSaving(false);
      }
    },
    [router, section, t],
  );

  return { save, saving };
}

export type SettingsSaveBarProps = {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  /** Extra buttons on the left. */
  children?: ReactNode;
  className?: string;
};

/** Sticky footer with Discard/Save. Render inside the <form>. */
export function SettingsSaveBar({ dirty, saving, onDiscard, children, className }: SettingsSaveBarProps) {
  const t = useT();
  return (
    <div
      className={cn(
        'bg-bg/95 border-border sticky bottom-0 z-10 -mx-1 mt-2 flex flex-wrap items-center gap-2 border-t px-1 py-3 backdrop-blur',
        className,
      )}
    >
      {children}
      <div className="ml-auto flex items-center gap-2">
        {dirty ? (
          <Badge variant="warning" aria-live="polite">
            {t('settings.form.unsaved')}
          </Badge>
        ) : null}
        <Button type="button" variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
          {t('settings.form.discard')}
        </Button>
        <Button type="submit" loading={saving} disabled={!dirty && !saving}>
          {t('settings.form.save')}
        </Button>
      </div>
    </div>
  );
}

export type SettingsCardProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Right-aligned header content. */
  actions?: ReactNode;
};

/** A titled group of fields. */
export function SettingsCard({ title, description, children, className, actions }: SettingsCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="grid gap-5">{children}</CardContent>
    </Card>
  );
}

/** Two-column field grid inside a card on wide screens. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-5 md:grid-cols-2', className)}>{children}</div>;
}
