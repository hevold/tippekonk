/**
 * /admin/forside/[key] — the layout editor for 'front' or 'section:<id>'.
 * Loads (creating on demand) the layout, the option lists for block
 * settings and details for already pinned articles, then hands everything
 * to the client <LayoutEditor>.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LayoutEditor } from '@/components/layout-editor/layout-editor';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { db } from '@/db';
import { articles, contentTypes, media, sections, tags } from '@/db/schema';
import { publicPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { layoutPinnedIds } from '@/lib/layout/engine';
import { layoutKeySchema } from '@/lib/validation/layout';
import { getAdminContext } from '@/server/auth/context';
import { getLayout, hasUnpublishedChanges, sectionIdFromKey } from '@/server/layouts';
import type { LayoutArticleInfo } from '@/server/layouts/actions';
import { mediaUrl } from '@/server/media/urls';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  return { title: key === 'front' ? 'Forside' : 'Seksjonsside' };
}

export default async function LayoutEditorPage({ params }: Props) {
  const ctx = await getAdminContext();
  if (!ctx.can('layout:edit')) {
    return (
      <>
        <PageHeader title={t('layout.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const { key: rawKey } = await params;
  const parsed = layoutKeySchema.safeParse(decodeURIComponent(rawKey));
  if (!parsed.success) notFound();
  const key = parsed.data;

  let layout: Awaited<ReturnType<typeof getLayout>>;
  try {
    layout = await getLayout(ctx.site.id, key, ctx.user.id);
  } catch {
    notFound();
  }

  const [sectionRows, tagRows, typeRows] = await Promise.all([
    db
      .select({ id: sections.id, name: sections.name, parentId: sections.parentId, slug: sections.slug })
      .from(sections)
      .where(and(eq(sections.siteId, ctx.site.id), eq(sections.isActive, true)))
      .orderBy(asc(sections.sortOrder), asc(sections.name)),
    db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(eq(tags.siteId, ctx.site.id))
      .orderBy(asc(tags.name)),
    db
      .select({ key: contentTypes.key, name: contentTypes.name })
      .from(contentTypes)
      .where(and(eq(contentTypes.siteId, ctx.site.id), eq(contentTypes.isActive, true)))
      .orderBy(asc(contentTypes.sortOrder)),
  ]);

  const pinned = layoutPinnedIds(layout.draft);
  const infoRows = pinned.length
    ? await db
        .select({
          id: articles.id,
          title: articles.title,
          kicker: articles.kicker,
          lead: articles.lead,
          status: articles.status,
          sectionName: sections.name,
          publishedAt: articles.publishedAt,
          scheduledAt: articles.scheduledAt,
          access: articles.access,
          isSponsored: articles.isSponsored,
          featuredMedia: media,
        })
        .from(articles)
        .leftJoin(sections, eq(sections.id, articles.sectionId))
        .leftJoin(media, eq(media.id, articles.featuredMediaId))
        .where(and(eq(articles.siteId, ctx.site.id), inArray(articles.id, pinned)))
    : [];
  const initialArticleInfo: LayoutArticleInfo[] = infoRows.map((r) => ({
    id: r.id,
    title: r.title || '(Uten tittel)',
    kicker: r.kicker,
    lead: r.lead,
    status: r.status,
    sectionName: r.sectionName,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    access: r.access,
    isSponsored: r.isSponsored,
    thumbnailUrl: r.featuredMedia && !r.featuredMedia.deletedAt ? mediaUrl(r.featuredMedia, 320) : null,
  }));

  const sectionId = sectionIdFromKey(key);
  const section = sectionId ? sectionRows.find((s) => s.id === sectionId) : null;
  const publicPath = section ? publicPaths.section(section.slug) : publicPaths.front();

  return (
    <LayoutEditor
      layout={{
        key: layout.key,
        name: layout.name,
        draft: layout.draft,
        published: layout.published,
        publishedAt: layout.publishedAt ? layout.publishedAt.toISOString() : null,
        updatedAt: layout.updatedAt.toISOString(),
        hasDraftChanges: hasUnpublishedChanges(layout),
      }}
      options={{
        sections: sectionRows.map(({ id, name, parentId }) => ({ id, name, parentId })),
        tags: tagRows,
        contentTypes: typeRows,
      }}
      permissions={{ edit: ctx.can('layout:edit'), publish: ctx.can('layout:publish') }}
      initialArticleInfo={initialArticleInfo}
      publicPath={publicPath}
    />
  );
}
