/**
 * /admin/artikler — the article list ("Saker"). The whole filter lives in
 * the URL (status tab, search, section, type, byline, assignee, access,
 * date range, sort, page); this server page validates it, queries the list
 * and tab counts, and hands serialised rows to the client table.
 * Contributors are scoped to their own articles in the query layer.
 */
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import type { ListQuery } from '@/components/newsroom/list-url';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { formatDate } from '@/lib/dates';
import { t } from '@/lib/i18n';
import {
  countArticlesByTab,
  listArticleFilterOptions,
  listArticles,
  parseArticleListFilter,
  tabFor,
} from '@/server/articles/list';
import { getAdminContext } from '@/server/auth/context';

import { ArticleTable } from './_components/article-table';
import { ListFilters } from './_components/list-filters';
import { StatusTabs } from './_components/status-tabs';
import { toRowDto, type ListPermissions } from './_components/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Saker' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  const sp = await searchParams;
  const filter = parseArticleListFilter(sp);

  const [page, counts, options] = await Promise.all([
    listArticles(ctx, filter),
    countArticlesByTab(ctx, filter),
    listArticleFilterOptions(ctx.site.id),
  ]);

  // The validated filter, back in URL form, is what tabs/links/filters build on.
  const query: ListQuery = {
    status: filter.status ?? '',
    q: filter.q ?? '',
    sectionId: filter.sectionId ?? '',
    contentTypeId: filter.contentTypeId ?? '',
    tagId: filter.tagId ?? '',
    authorId: filter.authorId ?? '',
    assignedTo: filter.assignedTo ?? '',
    access: filter.access ?? '',
    sort: filter.sort,
    page: String(page.page),
    from: filter.from ? formatDate(filter.from, 'iso-date') : '',
    to: filter.to ? formatDate(filter.to, 'iso-date') : '',
  };
  const active = tabFor(filter.status);
  const filtered = Boolean(
    filter.q ||
    filter.sectionId ||
    filter.contentTypeId ||
    filter.tagId ||
    filter.authorId ||
    filter.assignedTo ||
    filter.access ||
    filter.from ||
    filter.to,
  );

  const perm: ListPermissions = {
    userId: ctx.user.id,
    create: ctx.can('article:create'),
    editAny: ctx.can('article:edit_any'),
    editOwn: ctx.can('article:edit_own'),
    review: ctx.can('article:review'),
    publish: ctx.can('article:publish'),
    delete: ctx.can('article:delete'),
  };

  return (
    <>
      <PageHeader
        title={t('list.title')}
        description={t('list.description')}
        actions={
          perm.create ? (
            <Button asChild>
              <Link href={adminPaths.newArticle()}>
                <Plus />
                {t('list.new')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <StatusTabs query={query} active={active} counts={counts} />
      <ListFilters query={query} options={options} total={page.total} />
      <ArticleTable
        rows={page.items.map(toRowDto)}
        query={query}
        page={page.page}
        pageCount={page.pageCount}
        total={page.total}
        perm={perm}
        filtered={filtered || active !== 'all'}
        trashView={active === 'trash'}
      />
    </>
  );
}
