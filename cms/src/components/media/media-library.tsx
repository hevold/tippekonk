'use client';
/**
 * MediaLibrary — the /admin/media client shell: search and filters that
 * live in the URL (so the server page re-queries and links are shareable),
 * grid/list toggle, multi-select with bulk trash/restore/destroy, upload
 * dialog and link-based pagination. Data arrives from the server page.
 */
import { Grid2X2, List, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition } from 'react';

import { FilterBar } from '@/components/admin/filter-bar';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { LinkTabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { Media, MediaKind } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { destroyMedia, getMediaUsageCountsAction, restoreMedia, trashMedia } from '@/server/media/actions';
import type { MediaFolder, MediaPage } from '@/server/media/queries';

import { MediaCard } from './media-card';
import { kindLabelKey, MEDIA_KINDS } from './media-helpers';
import { UploadDropzone } from './upload-dropzone';

export type MediaLibraryFilters = {
  q: string;
  kind: MediaKind | '';
  folder: string;
  trashed: boolean;
};

export type MediaView = 'grid' | 'list';

export type MediaLibraryProps = {
  page: MediaPage;
  filters: MediaLibraryFilters;
  view: MediaView;
  /** true when the URL explicitly names a view (then localStorage is ignored). */
  viewForced?: boolean;
  folders: MediaFolder[];
  trashedCount: number;
  can: { upload: boolean; edit: boolean; delete: boolean };
};

const VIEW_STORAGE_KEY = 'desken:media:view';
const VIEW_EVENT = 'desken:media:view';

function readStoredView(): MediaView | null {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return v === 'grid' || v === 'list' ? v : null;
  } catch {
    return null;
  }
}

function subscribeView(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(VIEW_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(VIEW_EVENT, callback);
  };
}

function writeStoredView(view: MediaView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    /* private mode: the URL still carries the view */
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
}

/** Hydration-safe view preference: the server renders the URL's view, the browser's remembered choice wins afterwards. */
function useViewPreference(fallback: MediaView, forced: boolean): MediaView {
  const stored = useSyncExternalStore(subscribeView, readStoredView, () => null);
  return forced ? fallback : (stored ?? fallback);
}

export function MediaLibrary({
  page,
  filters,
  view: initialView,
  viewForced = false,
  folders,
  trashedCount,
  can,
}: MediaLibraryProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const view = useViewPreference(initialView, viewForced);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirm, setConfirm] = useState<'trash' | 'destroy' | null>(null);
  const [usageTotal, setUsageTotal] = useState<number>(0);

  // Drop selections that are no longer on the page (after filtering/paging).
  const pageIds = useMemo(() => new Set(page.items.map((m) => m.id)), [page.items]);
  const selectedOnPage = useMemo(() => [...selected].filter((id) => pageIds.has(id)), [selected, pageIds]);

  const buildHref = useCallback(
    (patch: Partial<MediaLibraryFilters & { page: number; view: MediaView }>): string => {
      const params = new URLSearchParams();
      const next = { ...filters, page: page.page, view, ...patch };
      if (next.q) params.set('q', next.q);
      if (next.kind) params.set('kind', next.kind);
      if (next.folder) params.set('folder', next.folder);
      if (next.trashed) params.set('trash', '1');
      if (next.page > 1) params.set('page', String(next.page));
      if (next.view !== 'grid') params.set('view', next.view);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [filters, page.page, pathname, view],
  );

  function navigate(patch: Partial<MediaLibraryFilters & { page: number; view: MediaView }>) {
    setSelected(new Set());
    startTransition(() => router.replace(buildHref({ page: 1, ...patch })));
  }

  function changeView(next: MediaView) {
    writeStoredView(next);
    startTransition(() => router.replace(buildHref({ view: next })));
  }

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const allOnPageSelected = page.items.length > 0 && selectedOnPage.length === page.items.length;

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(page.items.map((m) => m.id)) : new Set());
  }

  async function openTrashConfirm() {
    if (selectedOnPage.length === 0) return;
    const usage = await getMediaUsageCountsAction(selectedOnPage);
    setUsageTotal(usage.ok ? Object.values(usage.data).reduce((a, b) => a + b, 0) : 0);
    setConfirm('trash');
  }

  async function runBulk(action: 'trash' | 'restore' | 'destroy') {
    const ids = selectedOnPage;
    if (ids.length === 0) return;
    const fn = action === 'trash' ? trashMedia : action === 'restore' ? restoreMedia : destroyMedia;
    const result = await fn(ids);
    if (!result.ok) throw new Error(result.error);
    toast.success(t(`media.bulk.${action}Done`, { count: result.data.count }));
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  function onUploaded(uploaded: Media[]) {
    toast.success(t('media.upload.success', { count: uploaded.length }));
    setUploadOpen(false);
    startTransition(() => router.refresh());
  }

  const activeFilters = [filters.q, filters.kind, filters.folder].filter(Boolean).length;
  const kindOptions = [
    { value: '', label: t('media.filter.allKinds') },
    ...MEDIA_KINDS.map((k) => ({ value: k, label: t(kindLabelKey(k)) })),
  ];
  const folderOptions = [
    { value: '', label: t('media.filter.allFolders') },
    ...folders.map((f) => ({ value: f.name, label: `${f.name} (${f.count})` })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <LinkTabs
        items={[
          {
            href: buildHref({ trashed: false, page: 1 }),
            label: t('media.tabs.library'),
            exact: true,
            count: filters.trashed ? undefined : page.total,
          },
          { href: buildHref({ trashed: true, page: 1 }), label: t('media.tabs.trash'), count: trashedCount },
        ]}
      />

      <FilterBar
        search={{
          value: filters.q,
          onChange: (q) => navigate({ q }),
          placeholder: t('media.search.placeholder'),
        }}
        activeCount={activeFilters}
        onReset={() => navigate({ q: '', kind: '', folder: '' })}
        end={
          <>
            <span className="text-muted hidden text-[13px] tabular-nums sm:inline" aria-live="polite">
              {t('media.count', { count: page.total })}
            </span>
            <div
              className="border-border flex rounded-md border"
              role="group"
              aria-label={t('media.view.label')}
            >
              <IconButton
                label={t('media.view.grid')}
                size="sm"
                variant={view === 'grid' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'grid'}
                onClick={() => changeView('grid')}
              >
                <Grid2X2 />
              </IconButton>
              <IconButton
                label={t('media.view.list')}
                size="sm"
                variant={view === 'list' ? 'secondary' : 'ghost'}
                aria-pressed={view === 'list'}
                onClick={() => changeView('list')}
              >
                <List />
              </IconButton>
            </div>
            {can.upload && !filters.trashed ? (
              <Button size="sm" leftIcon={<Upload />} onClick={() => setUploadOpen(true)}>
                {t('media.upload.button')}
              </Button>
            ) : null}
          </>
        }
      >
        <NativeSelect
          size="sm"
          options={kindOptions}
          value={filters.kind}
          onChange={(e) => navigate({ kind: e.target.value as MediaKind | '' })}
          aria-label={t('media.filter.kind')}
          className="w-40"
        />
        {folders.length > 0 ? (
          <NativeSelect
            size="sm"
            options={folderOptions}
            value={filters.folder}
            onChange={(e) => navigate({ folder: e.target.value })}
            aria-label={t('media.filter.folder')}
            className="w-48"
          />
        ) : null}
      </FilterBar>

      {can.delete && page.items.length > 0 ? (
        <div
          className={cn(
            'bg-surface border-border flex flex-wrap items-center gap-3 rounded-md border px-3 py-2',
            selectedOnPage.length > 0 && 'border-primary/40 bg-primary-soft/40',
          )}
        >
          <Checkbox
            checked={allOnPageSelected ? true : selectedOnPage.length > 0 ? 'indeterminate' : false}
            onCheckedChange={(v) => toggleAll(v === true)}
            label={t('media.bulk.selectAll')}
          />
          <span className="text-muted text-[13px]" aria-live="polite">
            {selectedOnPage.length > 0 ? t('media.bulk.selected', { count: selectedOnPage.length }) : ''}
          </span>
          {selectedOnPage.length > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              {filters.trashed ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runBulk('restore').catch((e: Error) => toast.error(e.message))}
                  >
                    {t('media.actions.restore')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    leftIcon={<Trash2 />}
                    onClick={() => setConfirm('destroy')}
                  >
                    {t('media.actions.destroy')}
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" leftIcon={<Trash2 />} onClick={openTrashConfirm}>
                  {t('media.actions.trash')}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div aria-busy={pending} className={cn(pending && 'opacity-60 transition-opacity')}>
        {page.items.length === 0 ? (
          <EmptyState
            icon={<Upload />}
            title={
              filters.trashed
                ? t('media.empty.trashTitle')
                : activeFilters
                  ? t('media.empty.searchTitle')
                  : t('media.empty.title')
            }
            description={
              filters.trashed
                ? t('media.empty.trashDescription')
                : activeFilters
                  ? t('media.empty.searchDescription')
                  : t('media.empty.description')
            }
            action={
              can.upload && !filters.trashed && !activeFilters ? (
                <Button leftIcon={<Upload />} onClick={() => setUploadOpen(true)}>
                  {t('media.upload.button')}
                </Button>
              ) : undefined
            }
          />
        ) : view === 'grid' ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {page.items.map((media) => (
              <li key={media.id}>
                <MediaCard
                  media={media}
                  href={adminPaths.mediaItem(media.id)}
                  selectable={can.delete}
                  selected={selected.has(media.id)}
                  onSelectedChange={(on) => toggleSelected(media.id, on)}
                  onActivate={() => router.push(adminPaths.mediaItem(media.id))}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {page.items.map((media) => (
              <li key={media.id}>
                <MediaCard
                  media={media}
                  view="list"
                  href={adminPaths.mediaItem(media.id)}
                  selectable={can.delete}
                  selected={selected.has(media.id)}
                  onSelectedChange={(on) => toggleSelected(media.id, on)}
                  onActivate={() => router.push(adminPaths.mediaItem(media.id))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination page={page.page} pageCount={page.pageCount} hrefFor={(p) => buildHref({ page: p })} />

      {page.items.length > 0 && !filters.trashed ? (
        <p className="text-muted text-[13px]">
          {t('media.footer.hint')}{' '}
          <Link href={buildHref({ trashed: true, page: 1 })} className="text-primary hover:underline">
            {t('media.tabs.trash')}
          </Link>
        </p>
      ) : null}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen} title={t('media.upload.dialogTitle')} size="lg">
        <UploadDropzone onUploaded={onUploaded} fields folder={filters.folder || null} autoFocus />
      </Dialog>

      <ConfirmDialog
        open={confirm === 'trash'}
        onOpenChange={(o) => setConfirm(o ? 'trash' : null)}
        title={t('media.confirm.trashTitle', { count: selectedOnPage.length })}
        description={
          usageTotal > 0
            ? t('media.confirm.trashInUse', { count: usageTotal })
            : t('media.confirm.trashDescription')
        }
        confirmLabel={t('media.actions.trash')}
        onConfirm={() => runBulk('trash')}
      />
      <ConfirmDialog
        open={confirm === 'destroy'}
        onOpenChange={(o) => setConfirm(o ? 'destroy' : null)}
        title={t('media.confirm.destroyTitle', { count: selectedOnPage.length })}
        description={t('media.confirm.destroyDescription')}
        confirmLabel={t('media.actions.destroy')}
        destructive
        onConfirm={() => runBulk('destroy')}
      />
    </div>
  );
}
