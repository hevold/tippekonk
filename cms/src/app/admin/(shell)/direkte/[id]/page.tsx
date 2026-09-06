/**
 * /admin/direkte/[id] — the direktestudio for one live blog: settings,
 * status controls, composer and post timeline.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LiveBlogAdmin } from '@/components/live/live-blog-admin';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/db';
import { articles, media } from '@/db/schema';
import { docMediaIds } from '@/lib/content/text';
import { t } from '@/lib/i18n';
import { uuidSchema } from '@/lib/validation/common';
import { getAdminContext } from '@/server/auth/context';
import { getLiveBlog, listAuthorOptions, listPosts, toPostDto } from '@/server/live';
import { toLiveBlogDto } from '@/server/live/dto';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { title: 'Direkte' };
  const ctx = await getAdminContext();
  const blog = await getLiveBlog(ctx.site.id, parsed.data);
  return { title: blog ? blog.title : 'Direkte' };
}

export default async function LiveBlogAdminPage({ params }: Props) {
  const ctx = await getAdminContext();
  if (!ctx.can('live:manage')) {
    return (
      <>
        <PageHeader title={t('live.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const { id } = await params;
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) notFound();
  const blog = await getLiveBlog(ctx.site.id, parsed.data);
  if (!blog) notFound();

  const [posts, authors] = await Promise.all([
    listPosts(blog.id, { limit: 300 }),
    listAuthorOptions(ctx.site.id),
  ]);
  const mediaIds = [...new Set(posts.flatMap((p) => docMediaIds(p.body)))];
  const [mediaRows, articleRow] = await Promise.all([
    mediaIds.length
      ? db
          .select()
          .from(media)
          .where(and(eq(media.siteId, ctx.site.id), inArray(media.id, mediaIds), isNull(media.deletedAt)))
      : Promise.resolve([]),
    blog.articleId
      ? db.select({ title: articles.title }).from(articles).where(eq(articles.id, blog.articleId)).limit(1)
      : Promise.resolve([]),
  ]);

  return (
    <LiveBlogAdmin
      blog={toLiveBlogDto(blog)}
      posts={posts.map(toPostDto)}
      authors={authors}
      currentUserId={ctx.user.id}
      articleTitle={articleRow[0]?.title ?? null}
      media={Object.fromEntries(mediaRows.map((m) => [m.id, m]))}
      canManage={ctx.can('live:manage')}
    />
  );
}
