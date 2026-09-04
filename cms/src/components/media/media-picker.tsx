'use client';
/**
 * MediaPicker — the dialog editors use to insert an image (or any file) into
 * an article: browse and search the library, upload new files, fix alt text
 * and credit inline, then confirm.
 *
 *   <MediaPicker open={open} onOpenChange={setOpen} onSelect={(media) => insert(media)} kind="image" />
 *   <MediaPicker … multiple onSelectMany={(list) => insertGallery(list)} />
 *
 * Listing goes through the listMediaAction server action (paged, 40 per
 * page, "Last inn flere"); uploads go through /api/upload via
 * <UploadDropzone>. Inline metadata edits are saved with updateMediaMeta
 * when the user confirms, so the picked Media already carries them.
 */
import { ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { Media, MediaKind } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { listFoldersAction, listMediaAction, updateMediaMeta } from '@/server/media/actions';
import { acceptForKind } from '@/server/media/mime';

import { MediaCard, MediaThumb } from './media-card';
import { kindLabelKey, MEDIA_KINDS } from './media-helpers';
import { UploadDropzone } from './upload-dropzone';

export type MediaPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once per picked file (in selection order when `multiple`). */
  onSelect: (media: Media) => void;
  /** When set, called once with the whole selection instead of onSelect per item. */
  onSelectMany?: (media: Media[]) => void;
  multiple?: boolean;
  /** Restrict browsing and uploads to one kind. */
  kind?: MediaKind;
  title?: string;
  /** Default folder for uploads. */
  folder?: string | null;
  /** Whether the current user may upload / edit metadata (hides the affordances; the server enforces). */
  canUpload?: boolean;
  canEdit?: boolean;
};

type Edit = { alt: string; credit: string; caption: string };

const PER_PAGE = 40;

export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  onSelectMany,
  multiple = false,
  kind,
  title,
  folder = null,
  canUpload = true,
  canEdit = true,
}: MediaPickerProps) {
  const t = useT();
  const [tab, setTab] = useState<'library' | 'upload'>('library');
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<MediaKind | ''>(kind ?? '');
  const [folderFilter, setFolderFilter] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [items, setItems] = useState<Media[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  /** Filter key the current `items` were loaded for; differs from `queryKey` while a fetch is pending. */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Map<string, Media>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Map<string, Edit>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  /** Bumped on every open so re-opening refetches even with identical filters. */
  const [session, setSession] = useState(0);

  const effectiveKind: MediaKind | undefined = kind ?? (kindFilter || undefined);
  const queryKey = JSON.stringify([session, q, effectiveKind ?? '', folderFilter]);
  const loading = open && loadedKey !== queryKey;

  // Derived state on open/close: reset transient UI when closing, start a new fetch session when opening.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((n) => n + 1);
    } else {
      setSelected(new Map());
      setEdits(new Map());
      setActiveId(null);
      setTab('library');
      setQ('');
      setFolderFilter('');
      setKindFilter(kind ?? '');
    }
  }

  // Fetch page 1 whenever the query key changes while open. State updates happen after the await.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listMediaAction({
      q,
      kind: effectiveKind,
      folder: folderFilter || undefined,
      page: 1,
      perPage: PER_PAGE,
    }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setItems(result.data.items);
        setPage(result.data.page);
        setPageCount(result.data.pageCount);
        setTotal(result.data.total);
      } else {
        toast.error(result.error);
        setItems([]);
      }
      setLoadedKey(queryKey);
    });
    return () => {
      cancelled = true;
    };
  }, [open, queryKey, q, effectiveKind, folderFilter]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listFoldersAction().then((res) => {
      if (!cancelled && res.ok) setFolders(res.data.map((f) => f.name));
    });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  async function loadMore() {
    setLoadingMore(true);
    const result = await listMediaAction({
      q,
      kind: effectiveKind,
      folder: folderFilter || undefined,
      page: page + 1,
      perPage: PER_PAGE,
    });
    setLoadingMore(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setItems((prev) => [...prev, ...result.data.items.filter((m) => !prev.some((p) => p.id === m.id))]);
    setPage(result.data.page);
    setPageCount(result.data.pageCount);
    setTotal(result.data.total);
  }

  function toggle(media: Media) {
    setSelected((prev) => {
      const next = new Map(multiple ? prev : []);
      if (prev.has(media.id) && (multiple || prev.size === 1)) {
        next.delete(media.id);
        setActiveId(next.size ? [...next.keys()].pop()! : null);
      } else {
        next.set(media.id, media);
        setActiveId(media.id);
      }
      return next;
    });
  }

  const active = activeId ? (selected.get(activeId) ?? items.find((m) => m.id === activeId) ?? null) : null;
  const activeEdit: Edit | null = active
    ? (edits.get(active.id) ?? {
        alt: active.alt ?? '',
        credit: active.credit ?? '',
        caption: active.caption ?? '',
      })
    : null;

  function updateEdit(patch: Partial<Edit>) {
    if (!active || !activeEdit) return;
    setEdits((prev) => new Map(prev).set(active.id, { ...activeEdit, ...patch }));
  }

  function isDirty(media: Media, edit: Edit | undefined): boolean {
    if (!edit) return false;
    return (
      edit.alt !== (media.alt ?? '') ||
      edit.credit !== (media.credit ?? '') ||
      edit.caption !== (media.caption ?? '')
    );
  }

  async function confirm() {
    if (selected.size === 0) return;
    setConfirming(true);
    const picked: Media[] = [];
    for (const media of selected.values()) {
      const edit = edits.get(media.id);
      if (canEdit && isDirty(media, edit) && edit) {
        const result = await updateMediaMeta({
          id: media.id,
          alt: edit.alt,
          credit: edit.credit,
          caption: edit.caption,
        });
        if (result.ok) {
          picked.push(result.data);
          continue;
        }
        toast.error(result.error);
      }
      picked.push(media);
    }
    setConfirming(false);
    if (onSelectMany) onSelectMany(picked);
    else for (const media of picked) onSelect(media);
    onOpenChange(false);
  }

  function onUploaded(uploaded: Media[]) {
    setItems((prev) => [...uploaded, ...prev.filter((m) => !uploaded.some((u) => u.id === m.id))]);
    setTotal((n) => n + uploaded.length);
    setSelected((prev) => {
      const next = new Map(multiple ? prev : []);
      for (const media of multiple ? uploaded : uploaded.slice(0, 1)) next.set(media.id, media);
      return next;
    });
    setActiveId(uploaded[0]?.id ?? null);
    setTab('library');
    toast.success(t('media.upload.success', { count: uploaded.length }));
  }

  const kindOptions = [
    { value: '', label: t('media.filter.allKinds') },
    ...MEDIA_KINDS.map((k) => ({ value: k, label: t(kindLabelKey(k)) })),
  ];
  const folderOptions = [
    { value: '', label: t('media.filter.allFolders') },
    ...folders.map((f) => ({ value: f, label: f })),
  ];

  const dialogTitle = title ?? (multiple ? t('media.picker.titleMany') : t('media.picker.title'));

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      size="xl"
      flush
      className="h-[calc(100dvh-2rem)] max-h-[52rem]"
      preventClose={confirming}
      footer={
        <>
          <span className="text-muted mr-auto text-sm" aria-live="polite">
            {selected.size > 0
              ? t('media.picker.selectedCount', { count: selected.size })
              : t('media.picker.hint')}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {t('common.cancel')}
          </Button>
          <Button onClick={confirm} disabled={selected.size === 0} loading={confirming}>
            {multiple && selected.size > 1
              ? t('media.picker.confirmMany', { count: selected.size })
              : t('media.picker.confirm')}
          </Button>
        </>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'library' | 'upload')}
        className="flex h-full min-h-0 flex-col"
      >
        <TabsList className="px-5">
          <TabsTrigger value="library">{t('media.picker.tab.library')}</TabsTrigger>
          {canUpload ? <TabsTrigger value="upload">{t('media.picker.tab.upload')}</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="library" className="flex min-h-0 flex-1 flex-col pt-0">
          <div className="border-border flex flex-wrap items-center gap-2 border-b px-5 py-3">
            <SearchInput
              size="sm"
              value={q}
              onChange={setQ}
              placeholder={t('media.search.placeholder')}
              className="w-full sm:w-64"
              aria-label={t('common.search')}
            />
            {!kind ? (
              <NativeSelect
                size="sm"
                options={kindOptions}
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as MediaKind | '')}
                aria-label={t('media.filter.kind')}
                className="w-40"
              />
            ) : null}
            {folders.length > 0 ? (
              <NativeSelect
                size="sm"
                options={folderOptions}
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                aria-label={t('media.filter.folder')}
                className="w-44"
              />
            ) : null}
            <span className="text-muted ml-auto text-[13px] tabular-nums">
              {t('media.count', { count: total })}
            </span>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] w-full rounded-md" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Search />}
                  title={q ? t('media.empty.searchTitle') : t('media.empty.title')}
                  description={q ? t('media.empty.searchDescription') : t('media.empty.pickerDescription')}
                  action={
                    canUpload ? (
                      <Button size="sm" onClick={() => setTab('upload')}>
                        {t('media.picker.tab.upload')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <ul
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                    aria-label={t('media.picker.gridLabel')}
                  >
                    {items.map((media) => (
                      <li key={media.id}>
                        <MediaCard
                          media={media}
                          selectable
                          selected={selected.has(media.id)}
                          onSelectedChange={() => toggle(media)}
                          onActivate={(m) => {
                            toggle(m);
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                  {page < pageCount ? (
                    <div className="mt-4 flex justify-center">
                      <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
                        {t('media.picker.loadMore')}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <aside
              className={cn(
                'border-border hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto border-l p-4 md:flex',
                !active && 'text-muted items-center justify-center text-center text-sm',
              )}
              aria-label={t('media.picker.detailsLabel')}
            >
              {active && activeEdit ? (
                <>
                  <MediaThumb media={active} className="aspect-[4/3] w-full rounded" sizes="256px" />
                  <p className="truncate text-[13px] font-medium" title={active.filename}>
                    {active.filename}
                  </p>
                  <FormField label={t('media.field.alt')} required={active.kind === 'image'}>
                    <Input
                      size="sm"
                      value={activeEdit.alt}
                      onChange={(e) => updateEdit({ alt: e.target.value })}
                      readOnly={!canEdit}
                      maxLength={1000}
                    />
                  </FormField>
                  <FormField label={t('media.field.credit')}>
                    <Input
                      size="sm"
                      value={activeEdit.credit}
                      onChange={(e) => updateEdit({ credit: e.target.value })}
                      readOnly={!canEdit}
                      maxLength={300}
                      placeholder={t('media.field.creditPlaceholder')}
                    />
                  </FormField>
                  <FormField label={t('media.field.caption')}>
                    <Input
                      size="sm"
                      value={activeEdit.caption}
                      onChange={(e) => updateEdit({ caption: e.target.value })}
                      readOnly={!canEdit}
                      maxLength={2000}
                    />
                  </FormField>
                  <Link
                    href={adminPaths.mediaItem(active.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-[13px] hover:underline"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {t('media.picker.openDetails')}
                  </Link>
                </>
              ) : (
                <p>{t('media.picker.noneSelected')}</p>
              )}
            </aside>
          </div>
        </TabsContent>

        {canUpload ? (
          <TabsContent value="upload" className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            <UploadDropzone
              onUploaded={onUploaded}
              accept={acceptForKind(kind)}
              kind={kind}
              multiple={multiple}
              fields
              folder={folder}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </Dialog>
  );
}
