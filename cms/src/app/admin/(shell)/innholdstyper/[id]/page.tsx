/**
 * /admin/innholdstyper/[id] — edit a content type (key is immutable; fields
 * edited with the FieldDefEditor). Requires content_type:manage.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ContentTypeForm } from '@/components/newsroom/content-types/content-type-form';
import { toContentTypeDto } from '@/components/newsroom/content-types/types';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { uuidSchema } from '@/lib/validation/common';
import { getAdminContext } from '@/server/auth/context';
import { getContentTypeWithCounts } from '@/server/content-types/queries';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const ctx = await getAdminContext();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) return { title: t('contentTypes.title') };
  const contentType = await getContentTypeWithCounts(ctx.site.id, id);
  return { title: contentType ? contentType.name : t('contentTypes.title') };
}

export default async function EditContentTypePage({ params }: { params: Params }) {
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
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const contentType = await getContentTypeWithCounts(ctx.site.id, id);
  if (!contentType) notFound();

  return (
    <>
      <PageHeader
        title={contentType.name}
        description={t('contentTypes.editDescription', { key: contentType.key })}
        eyebrow={
          contentType.isDefault ? <Badge variant="info">{t('contentTypes.default')}</Badge> : undefined
        }
        breadcrumbs={[
          { label: t('contentTypes.title'), href: adminPaths.contentTypes() },
          { label: contentType.name },
        ]}
      />
      <ContentTypeForm contentType={toContentTypeDto(contentType)} />
    </>
  );
}
