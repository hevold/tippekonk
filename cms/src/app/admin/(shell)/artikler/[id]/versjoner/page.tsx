/**
 * /admin/artikler/[id]/versjoner — revision history: list, compare two
 * versions (word diff) and restore.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { RevisionsView } from '@/components/article-editor/revisions-view';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { uuidSchema } from '@/lib/validation/common';
import { ForbiddenError, NotFoundError } from '@/server/actions';
import { canEditArticle } from '@/server/articles/mutations';
import { getEditableArticle } from '@/server/articles/queries';
import { listRevisions } from '@/server/articles/revisions';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Versjoner' };

type Params = Promise<{ id: string }>;

export default async function ArticleRevisionsRoute({ params }: { params: Params }) {
  const ctx = await getAdminContext();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let article;
  try {
    article = await getEditableArticle(ctx, id, { includeTrashed: true });
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title={t('articles.revisions.title')} />
          <Alert variant="danger" title={t('common.error.forbidden')}>
            {t('articles.editor.forbidden')}
          </Alert>
        </>
      );
    }
    throw err;
  }

  const revisions = await listRevisions(article.id);
  const title = article.title.trim() || t('articles.untitled');

  return (
    <>
      <PageHeader
        title={t('articles.revisions.title')}
        description={title}
        breadcrumbs={[
          { label: t('nav.articles'), href: adminPaths.articles() },
          { label: title, href: adminPaths.article(article.id) },
          { label: t('articles.revisions.title') },
        ]}
      />
      <RevisionsView
        articleId={article.id}
        currentVersion={article.version}
        revisions={revisions}
        canRestore={canEditArticle(ctx, article) && !article.deletedAt}
      />
    </>
  );
}
