'use client';
/**
 * A row on the layout canvas: sortable header (drag handle, title, column
 * count, background, actions) and a grid of sortable blocks. The grid is
 * also a drop target so blocks can be dragged into an empty row.
 */
import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { LayoutRow } from '@/lib/layout/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { BlockCard } from './block-card';
import { dragId } from './dnd-announcements';

export type RowCardProps = {
  row: LayoutRow;
  index: number;
  total: number;
  selectedBlockId: string | null;
  articleDragActive: boolean;
  disabled?: boolean;
  onSelectBlock: (blockId: string) => void;
  onRowChange: (rowId: string, patch: Partial<Pick<LayoutRow, 'title' | 'columns' | 'background'>>) => void;
  onMoveRow: (rowId: string, toIndex: number) => void;
  onDuplicateRow: (rowId: string) => void;
  onRemoveRow: (rowId: string) => void;
  onAddBlock: (rowId: string) => void;
  onSpanChange: (blockId: string, span: number) => void;
  onDuplicateBlock: (blockId: string) => void;
  onRemoveBlock: (blockId: string) => void;
};

export function rowDropId(rowId: string): string {
  return `rowdrop:${rowId}`;
}

export function RowCard({
  row,
  index,
  total,
  selectedBlockId,
  articleDragActive,
  disabled,
  onSelectBlock,
  onRowChange,
  onMoveRow,
  onDuplicateRow,
  onRemoveRow,
  onAddBlock,
  onSpanChange,
  onDuplicateBlock,
  onRemoveBlock,
}: RowCardProps) {
  const t = useT();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: dragId('row', row.id),
      data: { kind: 'row' },
      disabled,
    });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: rowDropId(row.id),
    data: { kind: 'rowdrop', rowId: row.id },
  });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
  const rowLabel = row.title?.trim() || t('layout.editor.rowN', { n: index + 1 });

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-label={rowLabel}
      className={cn(
        'bg-surface-2/60 border-border rounded-lg border',
        isDragging && 'opacity-50',
        row.background === 'muted' && 'bg-surface-3/60',
        row.background === 'accent' && 'border-primary/40 bg-primary-soft/40',
      )}
      data-row-id={row.id}
    >
      <header className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            'text-subtle hover:text-text hover:bg-surface flex size-7 shrink-0 cursor-grab items-center justify-center rounded',
            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
            isDragging && 'cursor-grabbing',
          )}
          aria-label={t('layout.editor.dragRow', { label: rowLabel })}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className="text-muted w-6 shrink-0 text-xs tabular-nums">{index + 1}</span>
        <Input
          size="sm"
          className="w-44 shrink-0"
          aria-label={t('layout.editor.rowTitle')}
          placeholder={t('layout.editor.rowTitlePlaceholder')}
          value={row.title ?? ''}
          disabled={disabled}
          onChange={(e) => onRowChange(row.id, { title: e.target.value })}
        />
        <label className="text-muted flex items-center gap-1 text-xs">
          <span>{t('layout.editor.columns')}</span>
          <NativeSelect
            size="sm"
            className="w-16"
            aria-label={t('layout.editor.columnsAria')}
            value={String(row.columns)}
            disabled={disabled}
            onChange={(e) => onRowChange(row.id, { columns: Number(e.target.value) as LayoutRow['columns'] })}
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </label>
        <label className="text-muted flex items-center gap-1 text-xs">
          <span>{t('layout.editor.background')}</span>
          <NativeSelect
            size="sm"
            className="w-28"
            aria-label={t('layout.editor.backgroundAria')}
            value={row.background ?? 'none'}
            disabled={disabled}
            onChange={(e) => onRowChange(row.id, { background: e.target.value as LayoutRow['background'] })}
            options={[
              { value: 'none', label: t('layout.editor.background.none') },
              { value: 'muted', label: t('layout.editor.background.muted') },
              { value: 'accent', label: t('layout.editor.background.accent') },
            ]}
          />
        </label>
        <span className="flex-1" />
        <IconButton
          label={t('layout.editor.moveRowUp')}
          size="sm"
          disabled={disabled || index === 0}
          onClick={() => onMoveRow(row.id, index - 1)}
        >
          <ArrowUp className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.editor.moveRowDown')}
          size="sm"
          disabled={disabled || index >= total - 1}
          onClick={() => onMoveRow(row.id, index + 1)}
        >
          <ArrowDown className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.editor.duplicateRow')}
          size="sm"
          disabled={disabled}
          onClick={() => onDuplicateRow(row.id)}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton
          label={t('layout.editor.removeRow')}
          size="sm"
          disabled={disabled}
          onClick={() => onRemoveRow(row.id)}
        >
          <Trash2 className="size-3.5" />
        </IconButton>
      </header>
      <div
        ref={setDropRef}
        className={cn(
          'grid gap-2 px-2 pb-2',
          isOver && row.blocks.length === 0 && 'bg-primary-soft/60 rounded-b-lg',
        )}
        style={{ gridTemplateColumns: `repeat(${row.columns}, minmax(0, 1fr))` }}
      >
        <SortableContext items={row.blocks.map((b) => dragId('block', b.id))} strategy={rectSortingStrategy}>
          {row.blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              rowId={row.id}
              columns={row.columns}
              selected={block.id === selectedBlockId}
              acceptsArticleDrop={articleDragActive}
              onSelect={onSelectBlock}
              onSpanChange={onSpanChange}
              onDuplicate={onDuplicateBlock}
              onRemove={onRemoveBlock}
              disabled={disabled}
            />
          ))}
        </SortableContext>
        <div className="border-border/80 flex min-h-24 items-center justify-center rounded-md border border-dashed">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Plus />}
            disabled={disabled}
            onClick={() => onAddBlock(row.id)}
          >
            {t('layout.editor.addBlock')}
          </Button>
        </div>
      </div>
    </section>
  );
}
