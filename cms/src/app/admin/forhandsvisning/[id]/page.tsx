/**
 * /admin/forhandsvisning/<id> — preview of an article in any status, for
 * signed-in users of the newsroom. Renders exactly the public article page
 * (same components, same chrome) under a "Forhåndsvisning" banner. Never
 * cached; contributors can only preview their own articles.
 */
import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import '@/components/public/public.css';

import { ArticlePage } from '@/components/public/article-page';
import { SiteShell } from '@/components/public/site-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { adminPaths, publicPaths } from '@/config/routes';
import { setRequestLocale, t } from '@/lib/i18n';
import { I18nProvider } from '@/lib/i18n/client';
import { getAdminContext } from '@/server/auth/context';
import { getSiteChrome } from '@/server/public/chrome';
import { getArticleForPreview, getRelated } from '@/server/public/queries';
import { absoluteUrl, getBaseUrl } from '@/server/public/urls';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: 'Forhåndsvisning',
  robots: { index: false, follow: false },
};

export default async function PreviewPage({ params }: Props) {
  const ctx = await getAdminContext();
  if (!ctx.can('admin:access')) notFound();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const article = await getArticleForPreview(ctx.site.id, id);
  if (!article) notFound();
  // Contributors may only preview what they created (SPEC 5.1).
  if (!ctx.can('article:edit_any') && article.createdBy !== ctx.user.id) notFound();

  setRequestLocale(ctx.site.locale === 'nn' ? 'nn' : 'nb');
  const [chrome, baseUrl] = await Promise.all([getSiteChrome(ctx.site, ctx.settings), getBaseUrl(ctx.site)]);
  const canonicalPath = publicPaths.article(
    article.section?.slug,
    article.section ? article.slug : article.id,
  );
  const url = absoluteUrl(baseUrl, canonicalPath);
  const readAlso = await getRelated(
    ctx.site.id,
    { id: article.id, sectionId: article.section?.id ?? null },
    4,
  );
  const isPublished =
    article.status === 'published' && article.publishedAt !== null && article.publishedAt <= new Date();
  const statusLabel = t(`public.preview.status.${article.status}`);

  const banner = (
    <div className="border-warning/30 bg-warning-soft border-b print:hidden" data-preview="true">
      <div className="site-container py-2">
        <Alert
          variant="warning"
          className="border-0 bg-transparent px-0 py-0"
          title={t('public.preview.banner')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm" leftIcon={<ArrowLeft aria-hidden />}>
                <a href={adminPaths.article(article.id)}>{t('public.preview.backToEditor')}</a>
              </Button>
              {isPublished ? (
                <Button asChild variant="secondary" size="sm" rightIcon={<ExternalLink aria-hidden />}>
                  <a href={canonicalPath} target="_blank" rel="noopener noreferrer">
                    {t('public.preview.openPublic')}
                  </a>
                </Button>
              ) : null}
            </div>
          }
        >
          {t('public.preview.status', { status: statusLabel })}
          {!isPublished ? ` – ${t('public.preview.notPublished')}` : ''}
        </Alert>
      </div>
    </div>
  );

  return (
    <I18nProvider locale={ctx.site.locale === 'nn' ? 'nn' : 'nb'}>
      <SiteShell
        site={ctx.site}
        settings={ctx.settings}
        chrome={chrome}
        currentPath={canonicalPath}
        banner={banner}
      >
        <ArticlePage
          article={article}
          settings={ctx.settings}
          url={url}
          readAlso={readAlso}
          paywall={false}
        />
      </SiteShell>
    </I18nProvider>
  );
}
