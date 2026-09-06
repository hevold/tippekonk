/**
 * /admin/stikkord — tags admin: search and sort in the URL (?q=&sort=),
 * table with article counts, create/edit/merge/delete dialogs.
 * Requires taxonomy:manage.
 */
import type { Metadata } from 'next';

import { TagList, type TagSort } from '@/components/newsroom/tags/tag-list';
import { toTagDto } from '@/components/newsroom/tags/types';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listTagsWithCounts } from '@/server/taxonomy/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Stikkord' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const SORTS: TagSort[] = ['name', 'count', 'newest'];

export default async function TagsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  if (!ctx.can('taxonomy:manage')) {
    return (
      <>
        <PageHeader title={t('taxonomy.tags.title')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('taxonomy.forbidden')}
        </Alert>
      </>
    );
  }
  const sp = await searchParams;
  const q = (first(sp.q) ?? '').trim().slice(0, 100);
  const sortParam = first(sp.sort);
  const sort: TagSort = SORTS.includes(sortParam as TagSort) ? (sortParam as TagSort) : 'name';

  const [filtered, all] = await Promise.all([
    listTagsWithCounts(ctx.site.id, { q, sort }),
    q ? listTagsWithCounts(ctx.site.id, { sort: 'name' }) : null,
  ]);
  const tags = filtered.map(toTagDto);
  const allTags = all ? all.map(toTagDto) : tags;

  return (
    <>
      <PageHeader title={t('taxonomy.tags.title')} description={t('taxonomy.tags.description')} />
      <TagList tags={tags} all={allTags} q={q} sort={sort} />
    </>
  );
}
