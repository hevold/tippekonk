'use client';
/**
 * Pinned articles of a block: sortable list (drag handle + keyboard), per
 * item overrides (kicker, title, lead, image via the media picker) and
 * removal. Article details come from the editor's info cache.
 */
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical, ImageIcon, Search, X } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

import { defaultMediaUrl } from '@/components/editor/editor-host';
import { MediaPicker } from '@/components/media/media-picker';
import { Button, IconButton } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import type { Media } from '@/db/schema';
import { formatRelative } from '@/lib/dates';
import type { LayoutBlock, LayoutItem, LayoutItemOverrides } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { LayoutArticleInfo } from '@/server/layouts/actions';

import { dragId } from './dnd-announcements';

export type PinnedItemsProps = {
  block: LayoutBlock;
  pinnedIds: string[];
  articleInfo: Record<string, LayoutArticleInfo>;
  disabled?: boolean;
  onUnpin: (articleId: string) => void;
  onMove: (articleId: string, toIndex: number) => void;
  onOverridesChange: (articleId: string, overrides: LayoutItemOverrides) => void;
  onOpenSearch: () => void;
};

export function itemDragId(blockId: string, articleId: string): string {
  return dragId('item', `${blockId}|${articleId}`);
}

export function PinnedItems({
  block,
  pinnedIds,
  articleInfo,
  disabled,
  onUnpin,
  onMove,
  onOverridesChange,
  onOpenSearch,
}: PinnedItemsProps) {
  const t = useT();
  const items = block.items ?? [];
  return (
    <section aria-labelledby={`pinned-${block.id}`} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id={`pinned-${block.id}`} className="text-muted text-xs font-semibold tracking-wide uppercase">
          {t('layout.pinned.title')} ({items.length})
        </h3>
        <Button variant="ghost" size="sm" leftIcon={<Search />} disabled={disabled} onClick={onOpenSearch}>
          {t('layout.pinned.find')}
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-muted text-xs">{t('layout.pinned.empty')}</p>
      ) : (
        <SortableContext
          items={pinnedIds.map((id) => itemDragId(block.id, id))}
          strategy={verticalListSortingStrategy}
        >
          <ol className="flex flex-col gap-1.5">
            {items.map((item, index) => (
              <PinnedItem
                key={item.articleId}
                blockId={block.id}
                item={item}
                index={index}
                total={items.length}
                info={articleInfo[item.articleId]}
                disabled={disabled}
                onUnpin={onUnpin}
                onMove={onMove}
                onOverridesChange={onOverridesChange}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </section>
  );
}

type PinnedItemProps = {
  blockId: string;
  item: LayoutItem;
  index: number;
  total: number;
  info: LayoutArticleInfo | undefined;
  disabled?: boolean;
  onUnpin: (articleId: string) => void;
  onMove: (articleId: string, toIndex: number) => void;
  onOverridesChange: (articleId: string, overrides: LayoutItemOverrides) => void;
};

function PinnedItem({
  blockId,
  item,
  index,
  total,
  info,
  disabled,
  onUnpin,
  onMove,
  onOverridesChange,
}: PinnedItemProps) {
  const t = useT();
  const [open, setOpen] = useState(Boolean(item.overrides));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedMedia, setPickedMedia] = useState<Media | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: itemDragId(blockId, item.articleId),
      data: { kind: 'item', blockId, articleId: item.articleId },
      disabled,
    });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const overrides = item.overrides ?? {};
  const title = info?.title ?? t('layout.pinned.unknownArticle');
  const hasOverrides = Boolean(item.overrides && Object.keys(item.overrides).length);
  const when = info?.publishedAt ?? info?.scheduledAt;

  function patch(p: Partial<LayoutItemOverrides>) {
    onOverridesChange(item.articleId, { ...overrides, ...p });
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn('bg-surface border-border rounded-md border', isDragging && 'opacity-50')}
    >
      <div className="flex items-center gap-1.5 p-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            'text-subtle hover:text-text hover:bg-surface-2 flex size-7 shrink-0 cursor-grab items-center justify-center rounded',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
          )}
          aria-label={t('layout.pinned.drag', { title })}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        {info?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.thumbnailUrl} alt="" className="bg-surface-2 size-9 shrink-0 rounded object-cover" />
        ) : (
          <span className="bg-surface-2 text-subtle flex size-9 shrink-0 items-center justify-center rounded">
            <ImageIcon className="size-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{overrides.title?.trim() || title}</p>
          <p className="text-muted flex flex-wrap items-center gap-1 text-xs">
            {info ? <StatusBadge status={info.status} compact /> : null}
            {info?.sectionName ? <span>{info.sectionName}</span> : null}
            {when ? <span>· {formatRelative(when)}</span> : null}
            {hasOverrides ? <span className="text-primary">· {t('layout.pinned.overridden')}</span> : null}
          </p>
        </div>
        <IconButton
          label={t('layout.pinned.moveUp')}
          size="sm"
          disabled={disabled || index === 0}
          onClick={() => onMove(item.articleId, index - 1)}
        >
          <ChevronUp className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.pinned.moveDown')}
          size="sm"
          disabled={disabled || index >= total - 1}
          onClick={() => onMove(item.articleId, index + 1)}
        >
          <ChevronDown className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.pinned.remove')}
          size="sm"
          disabled={disabled}
          onClick={() => onUnpin(item.articleId)}
        >
          <X className="size-3.5" />
        </IconButton>
      </div>
      <div className="border-border border-t px-1.5 py-1">
        <button
          type="button"
          className="text-muted hover:text-text text-xs underline-offset-2 hover:underline"
          aria-expanded={open}
          aria-controls={`overrides-${blockId}-${item.articleId}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('layout.pinned.hideOverrides') : t('layout.pinned.showOverrides')}
        </button>
        {open ? (
          <div id={`overrides-${blockId}-${item.articleId}`} className="mt-2 flex flex-col gap-2 pb-1">
            <FormField label={t('layout.pinned.kicker')}>
              <Input
                size="sm"
                value={overrides.kicker ?? ''}
                maxLength={120}
                disabled={disabled}
                placeholder={info?.kicker ?? ''}
                onChange={(e) => patch({ kicker: e.target.value })}
              />
            </FormField>
            <FormField label={t('layout.pinned.titleOverride')}>
              <Input
                size="sm"
                value={overrides.title ?? ''}
                maxLength={300}
                disabled={disabled}
                placeholder={info?.title ?? ''}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </FormField>
            <FormField label={t('layout.pinned.lead')}>
              <Textarea
                rows={2}
                value={overrides.lead ?? ''}
                maxLength={1000}
                disabled={disabled}
                placeholder={info?.lead ?? ''}
                onChange={(e) => patch({ lead: e.target.value })}
              />
            </FormField>
            <div className="flex items-center gap-2">
              {overrides.imageMediaId ? (
                <>
                  {pickedMedia && pickedMedia.id === overrides.imageMediaId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={defaultMediaUrl(pickedMedia, 320)}
                      alt={pickedMedia.alt ?? ''}
                      className="bg-surface-2 size-10 rounded object-cover"
                    />
                  ) : (
                    <span className="text-muted text-xs">{t('layout.pinned.imageSet')}</span>
                  )}
                  <Button variant="outline" size="sm" disabled={disabled} onClick={() => setPickerOpen(true)}>
                    {t('layout.pinned.changeImage')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => patch({ imageMediaId: undefined })}
                  >
                    {t('layout.pinned.removeImage')}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ImageIcon />}
                  disabled={disabled}
                  onClick={() => setPickerOpen(true)}
                >
                  {t('layout.pinned.pickImage')}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        onSelect={(m) => {
          setPickedMedia(m);
          patch({ imageMediaId: m.id });
          setPickerOpen(false);
        }}
      />
    </li>
  );
}
