'use client';
/**
 * LayoutEditor — the front page / section page composer (/admin/forside/[key]).
 *
 * Canvas of rows (1–4 columns) holding blocks; a side panel with the
 * selected block's settings and pinned articles, and an article search
 * whose results can be pinned by button or dragged onto any block. One
 * dnd-kit context handles rows, blocks (also across rows), pinned items and
 * search results, with keyboard operation and Norwegian announcements.
 *
 * The draft autosaves (debounced) through server actions; "Publiser" copies
 * the draft to the published document; "Forkast endringer" restores the
 * published one. Undo/redo is a simple history stack.
 */
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Eye, Plus, Redo2, Rocket, RotateCcw, Save, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SavingIndicator, type SavingState } from '@/components/ui/saving-indicator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { formatRelative } from '@/lib/dates';
import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import type {
  LayoutBlockSettings,
  LayoutBlockType,
  LayoutDoc,
  LayoutItemOverrides,
  LayoutRow,
} from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import {
  discardLayoutDraftAction,
  lookupLayoutArticlesAction,
  publishLayoutAction,
  saveLayoutDraftAction,
  type LayoutArticleInfo,
  type LayoutDto,
} from '@/server/layouts/actions';

import { ArticleSearch } from './article-search';
import { blockSummary } from './block-card';
import { BlockPalette } from './block-palette';
import { BlockSettingsPanel } from './block-settings-panel';
import { buildAnnouncements, dragId, parseDragId, screenReaderInstructions } from './dnd-announcements';
import * as ops from './doc-ops';
import { PreviewPanel } from './preview-panel';
import { RowCard } from './row-card';
import type { LayoutEditorOptions, LayoutEditorPermissions } from './types';
import { useHistory } from './use-history';

export type LayoutEditorProps = {
  layout: LayoutDto;
  options: LayoutEditorOptions;
  permissions: LayoutEditorPermissions;
  initialArticleInfo: LayoutArticleInfo[];
  /** Public path this layout renders ("/" or "/nyheter"). */
  publicPath: string;
};

const AUTOSAVE_DELAY_MS = 1500;

type ActiveDrag = { kind: 'row' | 'block' | 'item' | 'search'; id: string; label: string };

export function LayoutEditor({
  layout,
  options,
  permissions,
  initialArticleInfo,
  publicPath,
}: LayoutEditorProps) {
  const t = useT();
  const history = useHistory<LayoutDoc>(layout.draft);
  const doc = history.value;
  const [published, setPublished] = useState<LayoutDoc | null>(layout.published);
  const [publishedAt, setPublishedAt] = useState<string | null>(layout.publishedAt);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<SavingState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [lastSaved, setLastSaved] = useState<LayoutDoc>(layout.draft);
  const [publishing, setPublishing] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [paletteRowId, setPaletteRowId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<'block' | 'search'>('block');
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [articleInfo, setArticleInfo] = useState<Record<string, LayoutArticleInfo>>(() =>
    Object.fromEntries(initialArticleInfo.map((a) => [a.id, a])),
  );
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const dragSnapshot = useRef<LayoutDoc | null>(null);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  const lookupRequested = useRef<Set<string>>(new Set(initialArticleInfo.map((a) => a.id)));

  const canEdit = permissions.edit;
  const dirty = !ops.sameDoc(doc, lastSaved);
  const hasDraftChanges = !ops.sameDoc(doc, published);
  const selected = selectedBlockId ? ops.findBlock(doc, selectedBlockId) : null;
  const pinnedInDoc = useMemo(() => new Set(ops.pinnedIds(doc)), [doc]);

  /* ----------------------------- persistence ------------------------------ */

  const save = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    if (saveInFlight.current) return saveInFlight.current;
    const snapshot = docRef.current;
    setSavingState('saving');
    const promise = saveLayoutDraftAction({ key: layout.key, doc: snapshot })
      .then((res) => {
        if (res.ok) {
          setLastSaved(snapshot);
          setSavedAt(new Date(res.data.updatedAt));
          setSavingState('saved');
          setSaveError(undefined);
          return true;
        }
        setSavingState('error');
        setSaveError(res.error);
        toast.error(res.error);
        return false;
      })
      .catch((err: unknown) => {
        console.error('[layout-editor] save', err);
        setSavingState('error');
        setSaveError(t('common.error.network'));
        return false;
      })
      .finally(() => {
        saveInFlight.current = null;
      });
    saveInFlight.current = promise;
    return promise;
  }, [canEdit, layout.key, t]);

  // Autosave: debounce after the last change.
  useEffect(() => {
    if (!dirty || !canEdit || activeDrag) return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, dirty, canEdit, activeDrag, save]);

  // Unsaved guard.
  useEffect(() => {
    if (!dirty && savingState !== 'saving') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, savingState]);

  // Keyboard shortcuts: Mod+S save, Mod+Z undo, Mod+Shift+Z / Mod+Y redo (outside text fields).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        if (dirty) void save();
        return;
      }
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (inField) return;
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dirty, save, history]);

  // Fetch details for pinned articles we have not seen yet.
  useEffect(() => {
    const missing = [...pinnedInDoc].filter((id) => !articleInfo[id] && !lookupRequested.current.has(id));
    if (!missing.length) return;
    for (const id of missing) lookupRequested.current.add(id);
    void lookupLayoutArticlesAction({ ids: missing }).then((res) => {
      if (!res.ok) return;
      setArticleInfo((prev) => ({ ...prev, ...Object.fromEntries(res.data.map((a) => [a.id, a])) }));
    });
  }, [pinnedInDoc, articleInfo]);

  async function publish() {
    if (!permissions.publish) return;
    setPublishing(true);
    try {
      if (dirty) {
        const ok = await save();
        if (!ok) return;
      }
      const res = await publishLayoutAction({ key: layout.key });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPublished(res.data.published);
      setPublishedAt(res.data.publishedAt);
      toast.success(t('layout.editor.publishedToast'));
    } finally {
      setPublishing(false);
    }
  }

  async function discard() {
    const res = await discardLayoutDraftAction({ key: layout.key });
    if (!res.ok) throw new Error(res.error);
    history.reset(res.data.draft);
    setLastSaved(res.data.draft);
    setSelectedBlockId(null);
    setSavingState('idle');
    toast.success(t('layout.editor.discardedToast'));
  }

  /* ------------------------------ mutations ------------------------------- */

  const apply = useCallback(
    (next: LayoutDoc, coalesceKey?: string) => {
      if (!canEdit) return;
      history.set(next, coalesceKey ? { coalesceKey } : undefined);
    },
    [canEdit, history],
  );

  function addRow(columns: LayoutRow['columns']) {
    const { doc: next, row } = ops.addRow(doc, columns);
    apply(next);
    setPaletteRowId(row.id);
  }
  function removeRow(rowId: string) {
    const row = doc.rows.find((r) => r.id === rowId);
    if (row && row.blocks.some((b) => b.id === selectedBlockId)) setSelectedBlockId(null);
    apply(ops.removeRow(doc, rowId));
  }
  function addBlock(type: LayoutBlockType) {
    if (!paletteRowId) return;
    const { doc: next, block } = ops.addBlock(doc, paletteRowId, type);
    apply(next);
    setSelectedBlockId(block.id);
    setSideTab('block');
  }
  function removeBlock(blockId: string) {
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    apply(ops.removeBlock(doc, blockId));
  }
  function duplicateBlock(blockId: string) {
    const { doc: next, block } = ops.duplicateBlock(doc, blockId);
    apply(next);
    if (block) setSelectedBlockId(block.id);
  }
  function selectBlock(blockId: string) {
    setSelectedBlockId(blockId);
    setSideTab('block');
  }
  function pin(blockId: string, articleId: string) {
    const target = ops.findBlock(doc, blockId);
    if (!target || !BLOCK_DEFINITIONS[target.block.type].supportsItems) {
      toast.error(t('layout.search.cannotPin'));
      return;
    }
    apply(ops.pinArticle(doc, blockId, articleId));
    toast.success(t('layout.search.pinnedToast', { block: blockSummary(target.block) }));
  }
  function updateSettings(patch: Partial<Record<keyof LayoutBlockSettings, unknown>>, coalesceKey?: string) {
    if (!selectedBlockId) return;
    apply(ops.updateBlockSettings(doc, selectedBlockId, patch), coalesceKey);
  }
  function setOverrides(articleId: string, overrides: LayoutItemOverrides) {
    if (!selectedBlockId) return;
    apply(
      ops.setItemOverrides(doc, selectedBlockId, articleId, overrides),
      `overrides:${selectedBlockId}:${articleId}`,
    );
  }

  /* -------------------------------- dnd ----------------------------------- */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const describe = useCallback(
    (id: string | number): string => {
      const parsed = parseDragId(id);
      const current = doc;
      if (!parsed) {
        const s = String(id);
        if (s.startsWith('rowdrop:')) {
          const idx = ops.findRowIndex(current, s.slice('rowdrop:'.length));
          return t('layout.editor.rowN', { n: idx + 1 });
        }
        return s;
      }
      if (parsed.kind === 'row') {
        const idx = ops.findRowIndex(current, parsed.id);
        const row = current.rows[idx];
        return row?.title?.trim() || t('layout.editor.rowN', { n: idx + 1 });
      }
      if (parsed.kind === 'block') {
        const found = ops.findBlock(current, parsed.id);
        return found
          ? t('layout.editor.blockIn', { block: blockSummary(found.block), row: found.rowIndex + 1 })
          : t('layout.editor.block');
      }
      if (parsed.kind === 'item') {
        const [, articleId] = parsed.id.split('|');
        return articleInfo[articleId ?? '']?.title ?? t('layout.pinned.unknownArticle');
      }
      return articleInfo[parsed.id]?.title ?? t('layout.editor.article');
    },
    [doc, articleInfo, t],
  );
  const announcements = useMemo(() => buildAnnouncements(describe), [describe]);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const kind = parseDragId(args.active.id)?.kind;
    const containers = args.droppableContainers;
    if (kind === 'search') {
      const blocks = containers.filter((c) => String(c.id).startsWith('block:'));
      const within = pointerWithin({ ...args, droppableContainers: blocks });
      return within.length ? within : rectIntersection({ ...args, droppableContainers: blocks });
    }
    if (kind === 'row')
      return closestCenter({
        ...args,
        droppableContainers: containers.filter((c) => String(c.id).startsWith('row:')),
      });
    if (kind === 'item')
      return closestCenter({
        ...args,
        droppableContainers: containers.filter((c) => String(c.id).startsWith('item:')),
      });
    const targets = containers.filter(
      (c) => String(c.id).startsWith('block:') || String(c.id).startsWith('rowdrop:'),
    );
    const within = pointerWithin({ ...args, droppableContainers: targets });
    return within.length ? within : closestCorners({ ...args, droppableContainers: targets });
  }, []);

  function onDragStart({ active }: DragStartEvent) {
    const parsed = parseDragId(active.id);
    if (!parsed) return;
    dragSnapshot.current = docRef.current;
    setActiveDrag({ kind: parsed.kind, id: parsed.id, label: describe(active.id) });
  }

  function onDragOver({ active, over }: DragOverEvent) {
    const a = parseDragId(active.id);
    if (!a || a.kind !== 'block' || !over) return;
    const current = docRef.current;
    const found = ops.findBlock(current, a.id);
    if (!found) return;
    const overId = String(over.id);
    if (overId.startsWith('rowdrop:')) {
      const rowId = overId.slice('rowdrop:'.length);
      if (rowId !== found.row.id) apply(ops.moveBlock(current, a.id, rowId, Number.MAX_SAFE_INTEGER), 'drag');
      return;
    }
    const o = parseDragId(overId);
    if (!o || o.kind !== 'block' || o.id === a.id) return;
    const target = ops.findBlock(current, o.id);
    if (!target || target.row.id === found.row.id) return;
    apply(ops.moveBlock(current, a.id, target.row.id, target.blockIndex), 'drag');
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const a = parseDragId(active.id);
    setActiveDrag(null);
    const snapshot = dragSnapshot.current;
    dragSnapshot.current = null;
    if (!a) return;
    const current = docRef.current;
    if (!over) {
      if (a.kind === 'block' && snapshot) apply(snapshot, 'drag');
      return;
    }
    const overId = String(over.id);
    const o = parseDragId(overId);
    if (a.kind === 'row' && o?.kind === 'row') {
      apply(ops.moveRow(current, a.id, ops.findRowIndex(current, o.id)));
      return;
    }
    if (a.kind === 'block') {
      if (o?.kind === 'block' && o.id !== a.id) {
        const target = ops.findBlock(current, o.id);
        if (target) apply(ops.moveBlock(current, a.id, target.row.id, target.blockIndex), 'drag');
      }
      return;
    }
    if (a.kind === 'item' && o?.kind === 'item') {
      const [blockId, articleId] = a.id.split('|');
      const [overBlockId, overArticleId] = o.id.split('|');
      if (!blockId || !articleId || blockId !== overBlockId) return;
      const target = ops.findBlock(current, blockId);
      const toIndex = (target?.block.items ?? []).findIndex((i) => i.articleId === overArticleId);
      if (toIndex !== -1) apply(ops.movePinnedItem(current, blockId, articleId, toIndex));
      return;
    }
    if (a.kind === 'search' && o?.kind === 'block') {
      pin(o.id, a.id);
    }
  }

  function onDragCancel() {
    const snapshot = dragSnapshot.current;
    dragSnapshot.current = null;
    setActiveDrag(null);
    if (activeDrag?.kind === 'block' && snapshot) apply(snapshot, 'drag');
  }

  /* -------------------------------- render -------------------------------- */

  const breadcrumbs = [{ label: t('nav.front'), href: adminPaths.front() }, { label: layout.name }];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <PageHeader
        title={layout.name}
        breadcrumbs={breadcrumbs}
        eyebrow={
          hasDraftChanges ? (
            <Badge variant="warning">{t('layout.editor.unpublishedChanges')}</Badge>
          ) : published ? (
            <Badge variant="success">{t('layout.editor.inSync')}</Badge>
          ) : (
            <Badge variant="muted">{t('layout.editor.neverPublished')}</Badge>
          )
        }
        description={
          publishedAt
            ? t('layout.editor.publishedAt', { when: formatRelative(publishedAt) })
            : t('layout.editor.notPublishedYet')
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SavingIndicator state={savingState} savedAt={savedAt} error={saveError} />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Undo2 />}
              disabled={!history.canUndo || !canEdit}
              onClick={history.undo}
            >
              {t('common.undo')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Redo2 />}
              disabled={!history.canRedo || !canEdit}
              onClick={history.redo}
            >
              {t('layout.editor.redo')}
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Eye />} onClick={() => setPreviewOpen(true)}>
              {t('layout.editor.preview')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw />}
              disabled={!canEdit || !hasDraftChanges}
              onClick={() => setDiscardOpen(true)}
            >
              {t('layout.editor.discard')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Save />}
              disabled={!canEdit || !dirty}
              loading={savingState === 'saving'}
              onClick={() => void save()}
            >
              {t('layout.editor.saveDraft')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Rocket />}
              disabled={!permissions.publish || (!hasDraftChanges && !dirty)}
              loading={publishing}
              onClick={() => void publish()}
            >
              {t('layout.editor.publish')}
            </Button>
          </div>
        }
      />

      {!canEdit ? (
        <Alert variant="info" className="mb-4">
          {t('layout.editor.readOnly')}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-3">
          {doc.rows.length === 0 ? (
            <EmptyState
              title={t('layout.editor.emptyTitle')}
              description={t('layout.editor.emptyDescription')}
              action={
                <Button leftIcon={<Plus />} disabled={!canEdit} onClick={() => addRow(1)}>
                  {t('layout.editor.addRow')}
                </Button>
              }
            />
          ) : (
            <SortableContext
              items={doc.rows.map((r) => dragId('row', r.id))}
              strategy={verticalListSortingStrategy}
            >
              {doc.rows.map((row, index) => (
                <RowCard
                  key={row.id}
                  row={row}
                  index={index}
                  total={doc.rows.length}
                  selectedBlockId={selectedBlockId}
                  articleDragActive={activeDrag?.kind === 'search'}
                  disabled={!canEdit}
                  onSelectBlock={selectBlock}
                  onRowChange={(rowId, patch) =>
                    apply(
                      ops.updateRow(doc, rowId, patch),
                      patch.title !== undefined ? `rowtitle:${rowId}` : undefined,
                    )
                  }
                  onMoveRow={(rowId, to) => apply(ops.moveRow(doc, rowId, to))}
                  onDuplicateRow={(rowId) => apply(ops.duplicateRow(doc, rowId).doc)}
                  onRemoveRow={removeRow}
                  onAddBlock={(rowId) => setPaletteRowId(rowId)}
                  onSpanChange={(blockId, span) => apply(ops.updateBlock(doc, blockId, { span }))}
                  onDuplicateBlock={duplicateBlock}
                  onRemoveBlock={removeBlock}
                />
              ))}
            </SortableContext>
          )}
          {doc.rows.length > 0 ? (
            <div className="border-border flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
              <span className="text-muted text-sm">{t('layout.editor.addRowWith')}</span>
              {([1, 2, 3, 4] as const).map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus />}
                  disabled={!canEdit}
                  onClick={() => addRow(n)}
                >
                  {t('layout.editor.columnsN', { count: n })}
                </Button>
              ))}
              <span className="flex-1" />
              <Button variant="link" size="sm" asChild>
                <Link href={publicPath} target="_blank" rel="noreferrer">
                  {t('layout.editor.openPublic')}
                </Link>
              </Button>
            </div>
          ) : null}
        </div>

        <aside
          className="bg-surface border-border h-fit rounded-lg border lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto"
          aria-label={t('layout.editor.sidePanel')}
        >
          <Tabs value={sideTab} onValueChange={(v) => setSideTab(v === 'search' ? 'search' : 'block')}>
            <TabsList className="px-3 pt-1">
              <TabsTrigger value="block">{t('layout.editor.tabBlock')}</TabsTrigger>
              <TabsTrigger value="search">{t('layout.editor.tabSearch')}</TabsTrigger>
            </TabsList>
            <TabsContent value="block" className="p-4">
              {selected ? (
                <BlockSettingsPanel
                  key={selected.block.id}
                  block={selected.block}
                  row={selected.row}
                  options={options}
                  articleInfo={articleInfo}
                  disabled={!canEdit}
                  onSettingsChange={updateSettings}
                  onSpanChange={(span) => apply(ops.updateBlock(doc, selected.block.id, { span }))}
                  onDuplicate={() => duplicateBlock(selected.block.id)}
                  onRemove={() => removeBlock(selected.block.id)}
                  onUnpin={(articleId) => apply(ops.unpinArticle(doc, selected.block.id, articleId))}
                  onMovePinned={(articleId, to) =>
                    apply(ops.movePinnedItem(doc, selected.block.id, articleId, to))
                  }
                  onOverridesChange={setOverrides}
                  onOpenSearch={() => setSideTab('search')}
                />
              ) : (
                <EmptyState
                  compact
                  title={t('layout.editor.noSelectionTitle')}
                  description={t('layout.editor.noSelectionDescription')}
                />
              )}
            </TabsContent>
            <TabsContent value="search" className="p-4">
              <ArticleSearch
                targetBlockLabel={selected ? blockSummary(selected.block) : null}
                canPinToTarget={Boolean(selected && BLOCK_DEFINITIONS[selected.block.type].supportsItems)}
                pinnedIds={pinnedInDoc}
                disabled={!canEdit}
                onPin={(articleId) => selected && pin(selected.block.id, articleId)}
                onResults={(results) =>
                  setArticleInfo((prev) => {
                    const next = { ...prev };
                    for (const r of results) next[r.id] = r;
                    return next;
                  })
                }
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="bg-surface border-primary rounded-md border px-3 py-2 text-sm font-medium shadow-lg">
            {activeDrag.label}
          </div>
        ) : null}
      </DragOverlay>

      <BlockPalette
        open={paletteRowId !== null}
        onOpenChange={(open) => !open && setPaletteRowId(null)}
        onPick={addBlock}
      />
      <PreviewPanel open={previewOpen} onOpenChange={setPreviewOpen} doc={doc} title={layout.name} />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('layout.editor.discardTitle')}
        description={
          published ? t('layout.editor.discardDescription') : t('layout.editor.discardDescriptionDefault')
        }
        confirmLabel={t('layout.editor.discard')}
        destructive
        onConfirm={discard}
      />
    </DndContext>
  );
}
