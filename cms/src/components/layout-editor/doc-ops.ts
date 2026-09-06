/**
 * Pure, immutable operations on a LayoutDoc for the front page editor.
 * Every function returns a new document (or the same one when nothing
 * changed) so React state and the undo history stay simple.
 */
import { nanoid } from 'nanoid';

import { BLOCK_DEFINITIONS } from '@/lib/layout/blocks';
import type {
  LayoutBlock,
  LayoutBlockSettings,
  LayoutBlockType,
  LayoutDoc,
  LayoutItem,
  LayoutItemOverrides,
  LayoutRow,
} from '@/lib/layout/types';

export type Columns = LayoutRow['columns'];

export function createRow(columns: Columns = 1, blocks: LayoutBlock[] = []): LayoutRow {
  return { id: nanoid(10), kind: 'row', columns, blocks };
}

export function createBlock(type: LayoutBlockType, settings: Partial<LayoutBlockSettings> = {}): LayoutBlock {
  const def = BLOCK_DEFINITIONS[type];
  const block: LayoutBlock = { id: nanoid(10), type, settings: { ...def.defaultSettings, ...settings } };
  if (def.defaultSpan > 1) block.span = def.defaultSpan;
  return block;
}

export function findRowIndex(doc: LayoutDoc, rowId: string): number {
  return doc.rows.findIndex((r) => r.id === rowId);
}

/** Row containing the block, or null. */
export function findBlock(
  doc: LayoutDoc,
  blockId: string,
): { row: LayoutRow; rowIndex: number; block: LayoutBlock; blockIndex: number } | null {
  for (let rowIndex = 0; rowIndex < doc.rows.length; rowIndex++) {
    const row = doc.rows[rowIndex]!;
    const blockIndex = row.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex !== -1) return { row, rowIndex, block: row.blocks[blockIndex]!, blockIndex };
  }
  return null;
}

function replaceRow(doc: LayoutDoc, rowIndex: number, row: LayoutRow): LayoutDoc {
  const rows = doc.rows.slice();
  rows[rowIndex] = row;
  return { ...doc, rows };
}

function move<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/* ---------------------------------- rows ---------------------------------- */

export function addRow(
  doc: LayoutDoc,
  columns: Columns,
  afterRowId?: string | null,
): { doc: LayoutDoc; row: LayoutRow } {
  const row = createRow(columns);
  const rows = doc.rows.slice();
  const index = afterRowId ? findRowIndex(doc, afterRowId) : -1;
  rows.splice(index === -1 ? rows.length : index + 1, 0, row);
  return { doc: { ...doc, rows }, row };
}

export function removeRow(doc: LayoutDoc, rowId: string): LayoutDoc {
  const index = findRowIndex(doc, rowId);
  if (index === -1) return doc;
  return { ...doc, rows: doc.rows.filter((r) => r.id !== rowId) };
}

export function moveRow(doc: LayoutDoc, rowId: string, toIndex: number): LayoutDoc {
  const from = findRowIndex(doc, rowId);
  if (from === -1) return doc;
  const to = Math.max(0, Math.min(doc.rows.length - 1, toIndex));
  if (from === to) return doc;
  return { ...doc, rows: move(doc.rows, from, to) };
}

export function updateRow(
  doc: LayoutDoc,
  rowId: string,
  patch: Partial<Pick<LayoutRow, 'title' | 'columns' | 'background'>>,
): LayoutDoc {
  const index = findRowIndex(doc, rowId);
  if (index === -1) return doc;
  const row = { ...doc.rows[index]!, ...patch };
  if (!row.title) delete row.title;
  if (!row.background || row.background === 'none') delete row.background;
  // Spans wider than the new column count would break the grid.
  row.blocks = row.blocks.map((b) => (b.span && b.span > row.columns ? { ...b, span: row.columns } : b));
  return replaceRow(doc, index, row);
}

export function duplicateRow(doc: LayoutDoc, rowId: string): { doc: LayoutDoc; row: LayoutRow | null } {
  const index = findRowIndex(doc, rowId);
  if (index === -1) return { doc, row: null };
  const source = doc.rows[index]!;
  const copy: LayoutRow = {
    ...source,
    id: nanoid(10),
    blocks: source.blocks.map((b) => ({
      ...b,
      id: nanoid(10),
      settings: { ...b.settings },
      items: b.items?.map((i) => ({ ...i })),
    })),
  };
  const rows = doc.rows.slice();
  rows.splice(index + 1, 0, copy);
  return { doc: { ...doc, rows }, row: copy };
}

/* --------------------------------- blocks --------------------------------- */

export function addBlock(
  doc: LayoutDoc,
  rowId: string,
  type: LayoutBlockType,
  index?: number,
): { doc: LayoutDoc; block: LayoutBlock } {
  const rowIndex = findRowIndex(doc, rowId);
  const block = createBlock(type);
  if (rowIndex === -1) return { doc, block };
  const row = doc.rows[rowIndex]!;
  if (block.span && block.span > row.columns) block.span = row.columns;
  const blocks = row.blocks.slice();
  blocks.splice(index === undefined ? blocks.length : Math.max(0, Math.min(blocks.length, index)), 0, block);
  return { doc: replaceRow(doc, rowIndex, { ...row, blocks }), block };
}

export function removeBlock(doc: LayoutDoc, blockId: string): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  return replaceRow(doc, found.rowIndex, {
    ...found.row,
    blocks: found.row.blocks.filter((b) => b.id !== blockId),
  });
}

export function duplicateBlock(
  doc: LayoutDoc,
  blockId: string,
): { doc: LayoutDoc; block: LayoutBlock | null } {
  const found = findBlock(doc, blockId);
  if (!found) return { doc, block: null };
  const copy: LayoutBlock = {
    ...found.block,
    id: nanoid(10),
    settings: { ...found.block.settings },
    items: found.block.items?.map((i) => ({ ...i })),
  };
  const blocks = found.row.blocks.slice();
  blocks.splice(found.blockIndex + 1, 0, copy);
  return { doc: replaceRow(doc, found.rowIndex, { ...found.row, blocks }), block: copy };
}

export function updateBlock(
  doc: LayoutDoc,
  blockId: string,
  patch: Partial<Pick<LayoutBlock, 'span' | 'items'>>,
): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  const block: LayoutBlock = { ...found.block, ...patch };
  if (block.span !== undefined && (!block.span || block.span <= 1)) delete block.span;
  if (block.span && block.span > found.row.columns) block.span = found.row.columns;
  if (block.items && block.items.length === 0) delete block.items;
  const blocks = found.row.blocks.slice();
  blocks[found.blockIndex] = block;
  return replaceRow(doc, found.rowIndex, { ...found.row, blocks });
}

/** Merge settings; `undefined`, `''` and `null` values remove the key. */
export function updateBlockSettings(
  doc: LayoutDoc,
  blockId: string,
  patch: Partial<Record<keyof LayoutBlockSettings, unknown>>,
): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  const settings: Record<string, unknown> = { ...found.block.settings };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '') delete settings[key];
    else settings[key] = value;
  }
  const block: LayoutBlock = { ...found.block, settings: settings as LayoutBlockSettings };
  const blocks = found.row.blocks.slice();
  blocks[found.blockIndex] = block;
  return replaceRow(doc, found.rowIndex, { ...found.row, blocks });
}

/**
 * Move a block to another position, possibly in another row. `toIndex` is
 * the target index in the destination row after removal from the source.
 */
export function moveBlock(doc: LayoutDoc, blockId: string, toRowId: string, toIndex: number): LayoutDoc {
  const found = findBlock(doc, blockId);
  const toRowIndex = findRowIndex(doc, toRowId);
  if (!found || toRowIndex === -1) return doc;
  if (found.row.id === toRowId) {
    const to = Math.max(0, Math.min(found.row.blocks.length - 1, toIndex));
    if (to === found.blockIndex) return doc;
    return replaceRow(doc, found.rowIndex, {
      ...found.row,
      blocks: move(found.row.blocks, found.blockIndex, to),
    });
  }
  const rows = doc.rows.slice();
  rows[found.rowIndex] = { ...found.row, blocks: found.row.blocks.filter((b) => b.id !== blockId) };
  const target = rows[toRowIndex]!;
  const blocks = target.blocks.slice();
  const block =
    found.block.span && found.block.span > target.columns
      ? { ...found.block, span: target.columns }
      : found.block;
  blocks.splice(Math.max(0, Math.min(blocks.length, toIndex)), 0, block);
  rows[toRowIndex] = { ...target, blocks };
  return { ...doc, rows };
}

/* ---------------------------------- items --------------------------------- */

export function pinArticle(doc: LayoutDoc, blockId: string, articleId: string, index?: number): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  if (!BLOCK_DEFINITIONS[found.block.type].supportsItems) return doc;
  const items = (found.block.items ?? []).filter((i) => i.articleId !== articleId);
  const item: LayoutItem = { articleId };
  items.splice(index === undefined ? items.length : Math.max(0, Math.min(items.length, index)), 0, item);
  return updateBlock(doc, blockId, { items });
}

export function unpinArticle(doc: LayoutDoc, blockId: string, articleId: string): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  return updateBlock(doc, blockId, {
    items: (found.block.items ?? []).filter((i) => i.articleId !== articleId),
  });
}

export function movePinnedItem(
  doc: LayoutDoc,
  blockId: string,
  articleId: string,
  toIndex: number,
): LayoutDoc {
  const found = findBlock(doc, blockId);
  if (!found) return doc;
  const items = found.block.items ?? [];
  const from = items.findIndex((i) => i.articleId === articleId);
  if (from === -1) return doc;
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (from === to) return doc;
  return updateBlock(doc, blockId, { items: move(items, from, to) });
}

export function setItemOverrides(
  doc: LayoutDoc,
  blockId: string,
  articleId: string,
  overrides: LayoutItemOverrides,
): LayoutDoc {
  const found = clean(overrides);
  const current = findBlock(doc, blockId);
  if (!current) return doc;
  const items = (current.block.items ?? []).map((i) =>
    i.articleId === articleId ? (found ? { articleId, overrides: found } : { articleId }) : i,
  );
  return updateBlock(doc, blockId, { items });
}

function clean(o: LayoutItemOverrides): LayoutItemOverrides | null {
  const out: LayoutItemOverrides = {};
  if (o.title?.trim()) out.title = o.title.trim();
  if (o.lead?.trim()) out.lead = o.lead.trim();
  if (o.kicker?.trim()) out.kicker = o.kicker.trim();
  if (o.imageMediaId) out.imageMediaId = o.imageMediaId;
  return Object.keys(out).length ? out : null;
}

/** Every pinned article id in the document. */
export function pinnedIds(doc: LayoutDoc): string[] {
  const ids = new Set<string>();
  for (const row of doc.rows)
    for (const block of row.blocks) for (const item of block.items ?? []) ids.add(item.articleId);
  return [...ids];
}

export function sameDoc(a: LayoutDoc | null | undefined, b: LayoutDoc | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function blockCount(doc: LayoutDoc): number {
  return doc.rows.reduce((n, r) => n + r.blocks.length, 0);
}
