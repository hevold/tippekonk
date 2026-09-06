import { describe, expect, it } from 'vitest';

import type { LayoutDoc } from '@/lib/layout/types';

import * as ops from './doc-ops';

function base(): LayoutDoc {
  return {
    version: 1,
    rows: [
      {
        id: 'r1',
        kind: 'row',
        columns: 2,
        blocks: [
          { id: 'b1', type: 'hero', settings: {} },
          { id: 'b2', type: 'list', settings: { limit: 5 }, span: 2 },
        ],
      },
      { id: 'r2', kind: 'row', columns: 1, blocks: [{ id: 'b3', type: 'ad', settings: { slotId: 'x' } }] },
    ],
  };
}

describe('doc-ops', () => {
  it('adds, moves, duplicates and removes rows immutably', () => {
    const doc = base();
    const { doc: withRow, row } = ops.addRow(doc, 3, 'r1');
    expect(withRow.rows.map((r) => r.id)).toEqual(['r1', row.id, 'r2']);
    expect(doc.rows).toHaveLength(2);
    const moved = ops.moveRow(withRow, 'r2', 0);
    expect(moved.rows[0]!.id).toBe('r2');
    const { doc: dup } = ops.duplicateRow(moved, 'r1');
    expect(dup.rows).toHaveLength(4);
    expect(dup.rows[2]!.blocks.map((b) => b.id)).not.toContain('b1');
    expect(ops.removeRow(dup, 'r2').rows).toHaveLength(3);
    expect(ops.moveRow(doc, 'missing', 1)).toBe(doc);
  });

  it('clamps spans when a row loses columns', () => {
    const doc = ops.updateRow(base(), 'r1', { columns: 1, title: '' });
    const row = doc.rows[0]!;
    expect(row.title).toBeUndefined();
    expect(row.blocks[1]!.span).toBe(1);
  });

  it('adds blocks with the definition defaults and moves them across rows', () => {
    const { doc, block } = ops.addBlock(base(), 'r2', 'heading');
    expect(block.settings).toEqual({ title: '' });
    expect(block.span).toBe(1); // clamped to the row's single column
    const moved = ops.moveBlock(doc, 'b1', 'r2', 0);
    expect(moved.rows[0]!.blocks.map((b) => b.id)).toEqual(['b2']);
    expect(moved.rows[1]!.blocks.map((b) => b.id)).toEqual(['b1', 'b3', block.id]);
    const reordered = ops.moveBlock(moved, 'b3', 'r2', 0);
    expect(reordered.rows[1]!.blocks.map((b) => b.id)).toEqual(['b3', 'b1', block.id]);
  });

  it('updates settings, dropping empty values', () => {
    const doc = ops.updateBlockSettings(base(), 'b2', { title: 'Siste', limit: undefined, showLead: true });
    expect(doc.rows[0]!.blocks[1]!.settings).toEqual({ showLead: true, title: 'Siste' });
  });

  it('pins, reorders, overrides and unpins articles only in blocks that support items', () => {
    let doc = ops.pinArticle(base(), 'b1', 'a1');
    doc = ops.pinArticle(doc, 'b1', 'a2');
    doc = ops.pinArticle(doc, 'b1', 'a1'); // re-pin moves to the end, no duplicate
    expect(doc.rows[0]!.blocks[0]!.items?.map((i) => i.articleId)).toEqual(['a2', 'a1']);
    doc = ops.movePinnedItem(doc, 'b1', 'a1', 0);
    expect(doc.rows[0]!.blocks[0]!.items?.map((i) => i.articleId)).toEqual(['a1', 'a2']);
    doc = ops.setItemOverrides(doc, 'b1', 'a1', { title: ' Ny tittel ', lead: '' });
    expect(doc.rows[0]!.blocks[0]!.items?.[0]).toEqual({
      articleId: 'a1',
      overrides: { title: 'Ny tittel' },
    });
    doc = ops.setItemOverrides(doc, 'b1', 'a1', {});
    expect(doc.rows[0]!.blocks[0]!.items?.[0]).toEqual({ articleId: 'a1' });
    doc = ops.unpinArticle(doc, 'b1', 'a1');
    doc = ops.unpinArticle(doc, 'b1', 'a2');
    expect(doc.rows[0]!.blocks[0]!.items).toBeUndefined();
    expect(ops.pinArticle(base(), 'b3', 'a1')).toEqual(base()); // ad blocks cannot pin
    expect(ops.pinnedIds(ops.pinArticle(base(), 'b2', 'z'))).toEqual(['z']);
  });

  it('duplicates blocks with fresh ids and copies of items', () => {
    const src = ops.pinArticle(base(), 'b1', 'a1');
    const { doc, block } = ops.duplicateBlock(src, 'b1');
    expect(block?.id).not.toBe('b1');
    expect(doc.rows[0]!.blocks).toHaveLength(3);
    expect(doc.rows[0]!.blocks[1]!.items).toEqual([{ articleId: 'a1' }]);
    expect(ops.blockCount(doc)).toBe(4);
  });
});
