'use client';
/**
 * One block inside a row on the layout canvas: sortable (drag handle +
 * keyboard), selectable, with span / duplicate / remove controls. Also a
 * drop target for articles dragged from the search panel.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, Pin, Trash2 } from 'lucide-react';
import type { CSSProperties, KeyboardEvent } from 'react';

import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import { DEFAULT_LIMITS } from '@/lib/layout/engine';
import type { LayoutBlock } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { BlockIcon } from './block-icons';
import { dragId } from './dnd-announcements';

export type BlockCardProps = {
  block: LayoutBlock;
  rowId: string;
  columns: number;
  selected: boolean;
  /** True while an article from the search panel is being dragged. */
  acceptsArticleDrop: boolean;
  onSelect: (blockId: string) => void;
  onSpanChange: (blockId: string, span: number) => void;
  onDuplicate: (blockId: string) => void;
  onRemove: (blockId: string) => void;
  disabled?: boolean;
};

export function blockSummary(block: LayoutBlock, sectionName?: string | null): string {
  const def = BLOCK_DEFINITIONS[block.type];
  const title = block.settings.title?.trim();
  if (title) return title;
  if (sectionName) return `${def.label}: ${sectionName}`;
  return def.label;
}

export function BlockCard({
  block,
  rowId,
  columns,
  selected,
  acceptsArticleDrop,
  onSelect,
  onSpanChange,
  onDuplicate,
  onRemove,
  disabled,
}: BlockCardProps) {
  const t = useT();
  const def = BLOCK_DEFINITIONS[block.type];
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id: dragId('block', block.id), data: { kind: 'block', rowId }, disabled });
  const span = Math.min(block.span ?? 1, columns);
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    gridColumn: `span ${span} / span ${span}`,
  };
  const pinned = block.items?.length ?? 0;
  const limit = block.settings.limit ?? DEFAULT_LIMITS[block.type];
  const articleDropActive = acceptsArticleDrop && def.supportsItems;
  const showDropHint = articleDropActive && isOver && String(active?.id ?? '').startsWith('search:');

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(block.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove(block.id);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={t('layout.editor.blockAria', { label: def.label, title: blockSummary(block) })}
      onClick={() => onSelect(block.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'group bg-surface border-border relative flex min-h-24 flex-col rounded-md border text-left shadow-xs transition-colors',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
        selected && 'border-primary ring-primary/40 ring-2',
        isDragging && 'opacity-50',
        showDropHint && 'border-success bg-success-soft',
        articleDropActive && !showDropHint && 'border-dashed',
      )}
      data-block-id={block.id}
    >
      <div className="flex items-center gap-1 px-2 pt-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            'text-subtle hover:text-text hover:bg-surface-2 -ml-1 flex size-7 shrink-0 cursor-grab items-center justify-center rounded',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            isDragging && 'cursor-grabbing',
          )}
          aria-label={t('layout.editor.dragBlock', { label: blockSummary(block) })}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <BlockIcon type={block.type} className="text-muted size-4 shrink-0" />
        <span className="truncate text-sm font-medium">{blockSummary(block)}</span>
      </div>
      <div className="text-muted flex flex-wrap items-center gap-1 px-2 pt-1.5 pb-2 text-xs">
        <Badge variant="muted">{def.label}</Badge>
        {def.autoFills && !block.settings.manualOnly && limit > 0 ? (
          <span>{t('layout.editor.limitBadge', { count: limit })}</span>
        ) : null}
        {block.settings.manualOnly ? <Badge variant="outline">{t('layout.editor.manualOnly')}</Badge> : null}
        {pinned > 0 ? (
          <span className="inline-flex items-center gap-0.5">
            <Pin className="size-3" aria-hidden />
            {t('layout.editor.pinnedBadge', { count: pinned })}
          </span>
        ) : null}
        {showDropHint ? (
          <span className="text-success font-medium">{t('layout.editor.dropToPin')}</span>
        ) : null}
      </div>
      <div
        className={cn(
          'border-border mt-auto flex items-center gap-1 border-t px-1.5 py-1',
          'opacity-70 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {columns > 1 ? (
          <label className="text-muted flex items-center gap-1 text-xs">
            <span>{t('layout.editor.span')}</span>
            <NativeSelect
              size="sm"
              aria-label={t('layout.editor.spanAria')}
              value={String(span)}
              disabled={disabled}
              onChange={(e) => onSpanChange(block.id, Number(e.target.value))}
              options={Array.from({ length: columns }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
            />
          </label>
        ) : null}
        <span className="flex-1" />
        <IconButton
          label={t('layout.editor.duplicateBlock')}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onDuplicate(block.id)}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.editor.removeBlock')}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onRemove(block.id)}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>
    </div>
  );
}
