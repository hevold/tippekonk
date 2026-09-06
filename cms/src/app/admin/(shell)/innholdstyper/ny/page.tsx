/**
 * /admin/innholdstyper/ny — create a content type. Requires content_type:manage.
 */
import type { Metadata } from 'next';

import { ContentTypeForm } from '@/components/newsroom/content-types/content-type-form';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ny innholdstype' };

export default async function NewContentTypePage() {
  const ctx = await getAdminContext();
  if (!ctx.can('content_type:manage')) {
    return (
      <>
        <PageHeader title={t('contentTypes.new')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('contentTypes.forbidden')}
        </Alert>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={t('contentTypes.new')}
        description={t('contentTypes.newDescription')}
        breadcrumbs={[
          { label: t('contentTypes.title'), href: adminPaths.contentTypes() },
          { label: t('contentTypes.new') },
        ]}
      />
      <ContentTypeForm />
    </>
  );
}
