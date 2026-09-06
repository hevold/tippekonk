/**
 * /admin/seksjoner — sections admin: the tree with counts, create/edit
 * dialogs, reordering and guarded deletion. Requires taxonomy:manage.
 */
import type { Metadata } from 'next';

import { SectionTree } from '@/components/newsroom/sections/section-tree';
import { toSectionDto } from '@/components/newsroom/sections/types';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listSectionsWithCounts } from '@/server/taxonomy/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seksjoner' };

export default async function SectionsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('taxonomy:manage')) {
    return (
      <>
        <PageHeader title={t('taxonomy.sections.title')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('taxonomy.forbidden')}
        </Alert>
      </>
    );
  }
  const sections = await listSectionsWithCounts(ctx.site.id);
  return (
    <>
      <PageHeader title={t('taxonomy.sections.title')} description={t('taxonomy.sections.description')} />
      <SectionTree sections={sections.map(toSectionDto)} />
    </>
  );
}
