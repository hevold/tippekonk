/**
 * /admin/direkte — live blogs overview with status badges and a create dialog.
 */
import type { Metadata } from 'next';

import { LiveBlogList } from '@/components/live/live-blog-list';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listLiveBlogs } from '@/server/live';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Direkte' };

export default async function LiveBlogsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('live:manage')) {
    return (
      <>
        <PageHeader title={t('live.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const blogs = await listLiveBlogs(ctx.site.id);
  return (
    <>
      <PageHeader title={t('live.title')} description={t('live.description')} />
      <LiveBlogList
        canManage={ctx.can('live:manage')}
        rows={blogs.map((b) => ({
          id: b.id,
          title: b.title,
          slug: b.slug,
          status: b.status,
          postCount: b.postCount,
          lastPostAt: b.lastPostAt ? b.lastPostAt.toISOString() : null,
          startedAt: b.startedAt ? b.startedAt.toISOString() : null,
          updatedAt: b.updatedAt.toISOString(),
          articleTitle: b.articleTitle,
        }))}
      />
    </>
  );
}
