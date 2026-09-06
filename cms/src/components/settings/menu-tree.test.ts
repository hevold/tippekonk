import { describe, expect, it } from 'vitest';

import type { MenuItem } from '@/lib/validation/site';

import {
  appendItem,
  indentItem,
  insertAfter,
  moveByOffset,
  moveSibling,
  newMenuItemId,
  outdentItem,
  removeItem,
  updateItem,
} from './menu-tree';

const tree: MenuItem[] = [
  { id: 'a', label: 'A', href: '/a' },
  { id: 'b', label: 'B', href: '/b', children: [{ id: 'b1', label: 'B1', href: '/b1' }] },
  { id: 'c', label: 'C', href: '/c' },
];

describe('menu-tree helpers', () => {
  it('updates, removes and appends immutably', () => {
    const updated = updateItem(tree, 'b1', { label: 'X' });
    expect(updated[1]?.children?.[0]?.label).toBe('X');
    expect(tree[1]?.children?.[0]?.label).toBe('B1');
    expect(removeItem(tree, 'b1')[1]).toEqual({ id: 'b', label: 'B', href: '/b' });
    expect(appendItem(tree, 'c', { id: 'c1', label: 'C1', href: '/c1' })[2]?.children).toHaveLength(1);
    expect(insertAfter(tree, 'a', { id: 'a2', label: 'A2', href: '/a2' })[1]?.id).toBe('a2');
  });

  it('indents under the previous sibling and outdents after the parent, honouring max depth', () => {
    const indented = indentItem(tree, 'c', 3);
    expect(indented).toHaveLength(2);
    expect(indented[1]?.children?.map((i) => i.id)).toEqual(['b1', 'c']);
    expect(indentItem(tree, 'a', 3)).toBe(tree);
    expect(indentItem(tree, 'c', 1)).toBe(tree);
    const out = outdentItem(tree, 'b1');
    expect(out.map((i) => i.id)).toEqual(['a', 'b', 'b1', 'c']);
    expect(out[1]?.children).toBeUndefined();
  });

  it('reorders siblings only within the same list', () => {
    expect(moveSibling(tree, 'c', 'a').map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(moveSibling(tree, 'b1', 'a')).toBe(tree);
    expect(moveByOffset(tree, 'a', 1).map((i) => i.id)).toEqual(['b', 'a', 'c']);
    expect(moveByOffset(tree, 'a', -1)).toBe(tree);
  });

  it('generates unique slug-like ids', () => {
    expect(newMenuItemId('Om oss', new Set())).toBe('om-oss');
    expect(newMenuItemId('Om oss', new Set(['om-oss']))).toBe('om-oss-2');
    expect(newMenuItemId('Blåbær', new Set())).toBe('blabaer');
    expect(newMenuItemId('!!!', new Set())).toBe('punkt');
  });
});
