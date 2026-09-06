'use client';
/**
 * BylinesCard — pick authors (Combobox, multiple) and set a role per byline
 * (tekst, foto, video, grafikk, annet). Order = order of selection; arrows
 * move a byline up or down.
 */
import { ArrowDown, ArrowUp, X } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { NativeSelect } from '@/components/ui/native-select';
import type { BylineRole } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import type { EditorAuthor } from '@/server/articles/queries';

import { BYLINE_ROLES, type EditorFormValues } from './types';

export type BylinesCardProps = {
  values: EditorFormValues;
  update: (patch: Partial<EditorFormValues>) => void;
  disabled: boolean;
  authors: EditorAuthor[];
  error?: string;
};

export function BylinesCard({ values, update, disabled, authors, error }: BylinesCardProps) {
  const t = useT();
  const byId = new Map(authors.map((a) => [a.id, a]));
  const selected = values.bylines.map((b) => b.authorId);

  function setAuthors(ids: string[]) {
    const existing = new Map(values.bylines.map((b) => [b.authorId, b]));
    update({
      bylines: ids.map((authorId) => existing.get(authorId) ?? { authorId, role: 'text' as BylineRole }),
    });
  }

  function setRole(authorId: string, role: BylineRole) {
    update({ bylines: values.bylines.map((b) => (b.authorId === authorId ? { ...b, role } : b)) });
  }

  function move(index: number, delta: number) {
    const next = [...values.bylines];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    update({ bylines: next });
  }

  function remove(authorId: string) {
    update({ bylines: values.bylines.filter((b) => b.authorId !== authorId) });
  }

  return (
    <div className="grid gap-3">
      <FormField label={t('articles.bylines.authors')} htmlFor="article-bylines" required error={error}>
        <Combobox
          id="article-bylines"
          multiple
          options={authors.map((a) => ({ value: a.id, label: a.name, description: a.title ?? undefined }))}
          value={selected}
          onChange={setAuthors}
          placeholder={t('articles.bylines.choose')}
          searchPlaceholder={t('articles.bylines.search')}
          disabled={disabled}
          invalid={Boolean(error)}
        />
      </FormField>
      {values.bylines.length > 0 ? (
        <ul className="grid gap-2" aria-label={t('articles.bylines.list')}>
          {values.bylines.map((b, index) => {
            const author = byId.get(b.authorId);
            return (
              <li
                key={b.authorId}
                className="border-border flex items-center gap-2 rounded-md border px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm">
                  {author?.name ?? t('articles.bylines.unknown')}
                </span>
                <NativeSelect
                  size="sm"
                  className="w-32"
                  aria-label={t('articles.bylines.roleFor', { name: author?.name ?? '' })}
                  value={b.role}
                  disabled={disabled}
                  options={BYLINE_ROLES.map((role) => ({
                    value: role,
                    label: t(`articles.bylines.role.${role}`),
                  }))}
                  onChange={(e) => setRole(b.authorId, e.target.value as BylineRole)}
                />
                {!disabled ? (
                  <>
                    <IconButton
                      size="sm"
                      label={t('articles.bylines.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label={t('articles.bylines.moveDown')}
                      disabled={index === values.bylines.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label={t('articles.bylines.remove')}
                      onClick={() => remove(b.authorId)}
                    >
                      <X />
                    </IconButton>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted text-sm">{t('articles.bylines.empty')}</p>
      )}
    </div>
  );
}
