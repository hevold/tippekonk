/**
 * /admin/skribenter — authors (bylines) admin: ordered list with photos,
 * counts and an active switch; create/edit dialog with MediaPicker.
 * Requires taxonomy:manage.
 */
import type { Metadata } from 'next';

import { AuthorList } from '@/components/newsroom/authors/author-list';
import { toAuthorDto } from '@/components/newsroom/authors/types';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listAuthorsWithCounts, listMemberOptions } from '@/server/taxonomy/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Skribenter' };

export default async function AuthorsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('taxonomy:manage')) {
    return (
      <>
        <PageHeader title={t('taxonomy.authors.title')} />
        <Alert variant="danger" title={t('common.error.forbidden')}>
          {t('taxonomy.forbidden')}
        </Alert>
      </>
    );
  }
  const [authors, members] = await Promise.all([
    listAuthorsWithCounts(ctx.site.id),
    listMemberOptions(ctx.site.id),
  ]);
  return (
    <>
      <PageHeader title={t('taxonomy.authors.title')} description={t('taxonomy.authors.description')} />
      <AuthorList authors={authors.map(toAuthorDto)} members={members} canUpload={ctx.can('media:upload')} />
    </>
  );
}
