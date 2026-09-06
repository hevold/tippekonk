/**
 * /admin/innholdstyper — content types admin: the list with field and
 * article counts and the default badge. Requires content_type:manage.
 */
import type { Metadata } from 'next';

import { ContentTypeList } from '@/components/newsroom/content-types/content-type-list';
import { toContentTypeDto } from '@/components/newsroom/content-types/types';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listContentTypesWithCounts } from '@/server/content-types/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Innholdstyper' };

export default async function ContentTypesPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('content_type:manage')) {
    return (
      <>
        <PageHeader title={t('contentTypes.title')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('contentTypes.forbidden')}
        </Alert>
      </>
    );
  }
  const types = await listContentTypesWithCounts(ctx.site.id);
  return (
    <>
      <PageHeader title={t('contentTypes.title')} description={t('contentTypes.description')} />
      <ContentTypeList contentTypes={types.map(toContentTypeDto)} />
    </>
  );
}
