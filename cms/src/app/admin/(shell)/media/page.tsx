/**
 * /admin/media — the media library ("Mediearkiv"). Filters live in the URL
 * (?q=&kind=&folder=&page=&trash=1&view=list); this server page validates
 * them, queries the library and hands plain data to the client shell.
 */
import type { Metadata } from 'next';

import { MediaLibrary, type MediaView } from '@/components/media/media-library';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { mediaFilterSchema } from '@/lib/validation/media';
import { getAdminContext } from '@/server/auth/context';
import { countTrashedMedia, listFolders, listMedia } from '@/server/media/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Mediearkiv' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MediaLibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  const sp = await searchParams;

  const parsed = mediaFilterSchema.safeParse({
    q: first(sp.q),
    kind: first(sp.kind),
    folder: first(sp.folder),
    trashed: first(sp.trash),
    page: first(sp.page),
  });
  const filter = parsed.success ? parsed.data : mediaFilterSchema.parse({});
  const viewParam = first(sp.view);
  const view: MediaView = viewParam === 'list' ? 'list' : 'grid';
  const viewForced = viewParam === 'list' || viewParam === 'grid';

  const [page, folders, trashedCount] = await Promise.all([
    listMedia(ctx.site.id, {
      q: filter.q,
      kind: filter.kind,
      folder: filter.folder || undefined,
      page: filter.page,
      perPage: filter.perPage,
      trashed: filter.trashed,
    }),
    listFolders(ctx.site.id),
    countTrashedMedia(ctx.site.id),
  ]);

  return (
    <>
      <PageHeader title={t('media.title')} description={t('media.description')} />
      <MediaLibrary
        page={page}
        filters={{
          q: filter.q ?? '',
          kind: filter.kind ?? '',
          folder: filter.folder ?? '',
          trashed: filter.trashed,
        }}
        view={view}
        viewForced={viewForced}
        folders={folders}
        trashedCount={trashedCount}
        can={{
          upload: ctx.can('media:upload'),
          edit: ctx.can('media:edit'),
          delete: ctx.can('media:delete'),
        }}
      />
    </>
  );
}
