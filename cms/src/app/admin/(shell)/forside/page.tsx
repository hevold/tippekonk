/**
 * /admin/forside — layouts overview: the front page and one entry per
 * section, with draft/published status and "Opprett" for sections that
 * have no layout yet.
 */
import type { Metadata } from 'next';

import { LayoutList } from '@/components/layout-editor/layout-list';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listLayouts } from '@/server/layouts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Forside' };

export default async function LayoutsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('layout:edit')) {
    return (
      <>
        <PageHeader title={t('layout.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const items = await listLayouts(ctx.site.id);
  return (
    <>
      <PageHeader title={t('layout.title')} description={t('layout.description')} />
      <LayoutList
        canEdit={ctx.can('layout:edit')}
        rows={items.map((i) => ({
          key: i.key,
          name: i.name,
          exists: i.exists,
          hasDraftChanges: i.hasDraftChanges,
          isPublished: i.isPublished,
          publishedAt: i.publishedAt ? i.publishedAt.toISOString() : null,
          updatedAt: i.updatedAt ? i.updatedAt.toISOString() : null,
          sectionSlug: i.sectionSlug,
          rowCount: i.rowCount,
        }))}
      />
    </>
  );
}
