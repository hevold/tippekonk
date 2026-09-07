/**
 * /admin/artikler/ny — create a draft and jump into the editor. With one
 * active content type (or ?type=key) the client creates it immediately;
 * with several, a small chooser is shown first.
 */
import type { Metadata } from 'next';

import { NewArticleLauncher } from '@/components/article-editor/new-article-launcher';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { listContentTypes } from '@/server/articles/queries';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ny sak' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewArticleRoute({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  const sp = await searchParams;
  const typeParam = Array.isArray(sp.type) ? sp.type[0] : sp.type;

  if (!ctx.can('article:create')) {
    return (
      <>
        <PageHeader title={t('articles.new.title')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('articles.new.forbidden')}
        </Alert>
      </>
    );
  }

  const types = (await listContentTypes(ctx.site.id)).filter((c) => c.isActive);

  return (
    <>
      <PageHeader
        title={t('articles.new.title')}
        breadcrumbs={[
          { label: t('nav.articles'), href: adminPaths.articles() },
          { label: t('articles.new.title') },
        ]}
      />
      <NewArticleLauncher types={types} preselectedKey={typeParam?.trim() || null} />
    </>
  );
}
