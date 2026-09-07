/**
 * /admin/artikler/[id] — the article editor. Loads the full edit model
 * (article, taxonomy options, media, revisions, notes, lock, checklist) and
 * renders the client <ArticleEditorPage>. Contributors may only open their
 * own articles (SPEC 5.1); everyone else with admin access can read.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleEditorPage } from '@/components/article-editor/article-editor-page';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { uuidSchema } from '@/lib/validation/common';
import { ForbiddenError, NotFoundError } from '@/server/actions';
import { getArticleForEdit } from '@/server/articles/queries';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await getAdminContext();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return { title: t('articles.editor.title') };
  try {
    const model = await getArticleForEdit(ctx, id);
    return { title: model.article.title.trim() || t('articles.untitled') };
  } catch {
    return { title: t('articles.editor.title') };
  }
}

export default async function ArticleEditorRoute({ params }: { params: Params }) {
  const ctx = await getAdminContext();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let model;
  try {
    model = await getArticleForEdit(ctx, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError) {
      return (
        <>
          <PageHeader title={t('articles.editor.title')} />
          <Alert variant="danger" title={t('common.error.forbidden')}>
            {t('articles.editor.forbidden')}
          </Alert>
        </>
      );
    }
    throw err;
  }

  return (
    <ArticleEditorPage
      model={model}
      settings={ctx.settings}
      currentUser={{ id: ctx.user.id, name: ctx.user.name }}
      canUploadMedia={ctx.can('media:upload')}
      canEditMedia={ctx.can('media:edit')}
    />
  );
}
