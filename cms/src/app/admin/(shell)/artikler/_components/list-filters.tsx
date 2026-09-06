'use client';
/**
 * ListFilters — search, section, content type, byline, assignee, access,
 * date range and sort for the article list. Every change is written to the
 * URL (router.replace) so the server page re-renders with the new filter and
 * the view stays shareable.
 */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { FilterBar } from '@/components/admin/filter-bar';
import { activeFilterCount, listHref, withQuery, type ListQuery } from '@/components/newsroom/list-url';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useT } from '@/lib/i18n/client';
import type { ArticleListOptions } from '@/server/articles/list';

export type ListFiltersProps = {
  query: ListQuery;
  options: ArticleListOptions;
  total: number;
};

const SORTS = [
  '-updatedAt',
  'updatedAt',
  '-publishedAt',
  'publishedAt',
  'title',
  '-title',
  'deadlineAt',
  '-deadlineAt',
  '-createdAt',
] as const;

export function ListFilters({ query, options, total }: ListFiltersProps) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(patch: ListQuery) {
    const next = withQuery(query, patch);
    startTransition(() => router.replace(listHref(next), { scroll: false }));
  }

  function reset() {
    startTransition(() =>
      router.replace(listHref({ status: query.status, sort: query.sort }), { scroll: false }),
    );
  }

  const sectionLabel = (s: ArticleListOptions['sections'][number]) =>
    `${s.parentId ? '– ' : ''}${s.name}${s.isActive ? '' : ` (${t('list.inactive')})`}`;

  return (
    <div className="mb-3 grid gap-2">
      <FilterBar
        search={{
          value: query.q ?? '',
          onChange: (q) => apply({ q }),
          placeholder: t('list.searchPlaceholder'),
        }}
        activeCount={activeFilterCount(query)}
        onReset={reset}
        end={
          <div className="flex items-center gap-2">
            {pending ? <Spinner size="sm" label={t('common.loading')} /> : null}
            <span className="text-muted text-sm tabular-nums" aria-live="polite">
              {t('list.count', { count: total })}
            </span>
            <Label htmlFor="list-sort" className="sr-only">
              {t('list.sort')}
            </Label>
            <NativeSelect
              id="list-sort"
              size="sm"
              className="w-44"
              value={query.sort ?? '-updatedAt'}
              onChange={(e) => apply({ sort: e.target.value })}
              options={SORTS.map((s) => ({ value: s, label: t(`list.sort.${s.replace('-', 'desc_')}`) }))}
            />
          </div>
        }
      >
        <Label htmlFor="list-section" className="sr-only">
          {t('list.filter.section')}
        </Label>
        <NativeSelect
          id="list-section"
          size="sm"
          className="w-40"
          value={query.sectionId ?? ''}
          onChange={(e) => apply({ sectionId: e.target.value })}
          placeholder={t('list.filter.section')}
          options={options.sections.map((s) => ({ value: s.id, label: sectionLabel(s) }))}
        />
        <Label htmlFor="list-type" className="sr-only">
          {t('list.filter.contentType')}
        </Label>
        <NativeSelect
          id="list-type"
          size="sm"
          className="w-40"
          value={query.contentTypeId ?? ''}
          onChange={(e) => apply({ contentTypeId: e.target.value })}
          placeholder={t('list.filter.contentType')}
          options={options.contentTypes.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Label htmlFor="list-author" className="sr-only">
          {t('list.filter.author')}
        </Label>
        <NativeSelect
          id="list-author"
          size="sm"
          className="w-40"
          value={query.authorId ?? ''}
          onChange={(e) => apply({ authorId: e.target.value })}
          placeholder={t('list.filter.author')}
          options={options.authors.map((a) => ({ value: a.id, label: a.name }))}
        />
        <Label htmlFor="list-assignee" className="sr-only">
          {t('list.filter.assignedTo')}
        </Label>
        <NativeSelect
          id="list-assignee"
          size="sm"
          className="w-40"
          value={query.assignedTo ?? ''}
          onChange={(e) => apply({ assignedTo: e.target.value })}
          placeholder={t('list.filter.assignedTo')}
          options={options.members.map((m) => ({ value: m.id, label: m.name }))}
        />
        <Label htmlFor="list-access" className="sr-only">
          {t('list.filter.access')}
        </Label>
        <NativeSelect
          id="list-access"
          size="sm"
          className="w-32"
          value={query.access ?? ''}
          onChange={(e) => apply({ access: e.target.value })}
          placeholder={t('list.filter.access')}
          options={[
            { value: 'open', label: t('common.access.open') },
            { value: 'plus', label: t('common.access.plus') },
          ]}
        />
        <div className="flex items-center gap-1">
          <Label htmlFor="list-from" className="text-muted text-xs font-normal">
            {t('list.filter.from')}
          </Label>
          <Input
            id="list-from"
            type="date"
            size="sm"
            className="w-36"
            value={query.from ?? ''}
            onChange={(e) => apply({ from: e.target.value })}
          />
          <Label htmlFor="list-to" className="text-muted text-xs font-normal">
            {t('list.filter.to')}
          </Label>
          <Input
            id="list-to"
            type="date"
            size="sm"
            className="w-36"
            value={query.to ?? ''}
            onChange={(e) => apply({ to: e.target.value })}
          />
        </div>
      </FilterBar>
    </div>
  );
}
