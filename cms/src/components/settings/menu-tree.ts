/**
 * Pure helpers for editing a nested MenuItem tree (immutable updates):
 * find, replace, remove, insert, indent/outdent and sibling reordering.
 */
import type { MenuItem } from '@/lib/validation/site';

export type MenuPath = number[];

/** Path of indices to an item, or null. */
export function findPath(items: MenuItem[], id: string, prefix: MenuPath = []): MenuPath | null {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (item.id === id) return [...prefix, i];
    if (item.children) {
      const found = findPath(item.children, id, [...prefix, i]);
      if (found) return found;
    }
  }
  return null;
}

export function getAt(items: MenuItem[], path: MenuPath): MenuItem | null {
  let list: MenuItem[] | undefined = items;
  let current: MenuItem | null = null;
  for (const index of path) {
    current = list?.[index] ?? null;
    if (!current) return null;
    list = current.children;
  }
  return current;
}

/** The sibling list that contains `path` (root list when path has one segment). */
export function siblingsAt(items: MenuItem[], path: MenuPath): MenuItem[] {
  if (path.length <= 1) return items;
  return getAt(items, path.slice(0, -1))?.children ?? [];
}

/** Replace the sibling list at `parentPath` ([] = root) with `list`. */
export function replaceList(items: MenuItem[], parentPath: MenuPath, list: MenuItem[]): MenuItem[] {
  if (parentPath.length === 0) return list;
  const [head, ...rest] = parentPath;
  return items.map((item, i) => {
    if (i !== head) return item;
    const children = replaceList(item.children ?? [], rest, list);
    return children.length > 0 ? { ...item, children } : withoutChildren(item);
  });
}

function withoutChildren(item: MenuItem): MenuItem {
  const { children: _children, ...rest } = item;
  void _children;
  return rest;
}

export function updateItem(items: MenuItem[], id: string, patch: Partial<MenuItem>): MenuItem[] {
  return items.map((item) => {
    const next = item.id === id ? { ...item, ...patch } : item;
    if (next.children) {
      const children = updateItem(next.children, id, patch);
      return { ...next, children };
    }
    return next;
  });
}

export function removeItem(items: MenuItem[], id: string): MenuItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) => {
      if (!item.children) return item;
      const children = removeItem(item.children, id);
      return children.length > 0 ? { ...item, children } : withoutChildren(item);
    });
}

/** Append `child` under `parentId` (or at the root when parentId is null). */
export function appendItem(items: MenuItem[], parentId: string | null, child: MenuItem): MenuItem[] {
  if (parentId === null) return [...items, child];
  return items.map((item) => {
    if (item.id === parentId) return { ...item, children: [...(item.children ?? []), child] };
    if (item.children) return { ...item, children: appendItem(item.children, parentId, child) };
    return item;
  });
}

/** Insert `child` right after the item with `afterId` in the same list. */
export function insertAfter(items: MenuItem[], afterId: string, child: MenuItem): MenuItem[] {
  const path = findPath(items, afterId);
  if (!path) return [...items, child];
  const siblings = siblingsAt(items, path);
  const index = path[path.length - 1]!;
  const next = [...siblings.slice(0, index + 1), child, ...siblings.slice(index + 1)];
  return replaceList(items, path.slice(0, -1), next);
}

export function depthOf(items: MenuItem[], id: string): number {
  return findPath(items, id)?.length ?? 0;
}

/** Height of the subtree rooted at the item (1 for a leaf). */
export function subtreeDepth(item: MenuItem): number {
  if (!item.children || item.children.length === 0) return 1;
  return 1 + Math.max(...item.children.map(subtreeDepth));
}

/** Move an item under its previous sibling (as its last child). */
export function indentItem(items: MenuItem[], id: string, maxDepth: number): MenuItem[] {
  const path = findPath(items, id);
  if (!path) return items;
  const index = path[path.length - 1]!;
  if (index === 0) return items;
  const siblings = siblingsAt(items, path);
  const item = siblings[index]!;
  const previous = siblings[index - 1]!;
  if (path.length + subtreeDepth(item) > maxDepth) return items;
  const nextSiblings = siblings.filter((_, i) => i !== index);
  nextSiblings[index - 1] = { ...previous, children: [...(previous.children ?? []), item] };
  return replaceList(items, path.slice(0, -1), nextSiblings);
}

/** Move an item out one level, placing it right after its parent. */
export function outdentItem(items: MenuItem[], id: string): MenuItem[] {
  const path = findPath(items, id);
  if (!path || path.length < 2) return items;
  const item = getAt(items, path)!;
  const parentPath = path.slice(0, -1);
  const parent = getAt(items, parentPath)!;
  const without = removeItem(items, id);
  return insertAfter(without, parent.id, item);
}

/** Reorder within one sibling list (dnd). */
export function moveSibling(items: MenuItem[], activeId: string, overId: string): MenuItem[] {
  const from = findPath(items, activeId);
  const to = findPath(items, overId);
  if (!from || !to) return items;
  const fromParent = from.slice(0, -1);
  const toParent = to.slice(0, -1);
  if (fromParent.join('.') !== toParent.join('.')) return items;
  const siblings = [...siblingsAt(items, from)];
  const fromIndex = from[from.length - 1]!;
  const toIndex = to[to.length - 1]!;
  const [moved] = siblings.splice(fromIndex, 1);
  if (!moved) return items;
  siblings.splice(toIndex, 0, moved);
  return replaceList(items, fromParent, siblings);
}

export function moveByOffset(items: MenuItem[], id: string, offset: -1 | 1): MenuItem[] {
  const path = findPath(items, id);
  if (!path) return items;
  const siblings = siblingsAt(items, path);
  const index = path[path.length - 1]!;
  const target = siblings[index + offset];
  if (!target) return items;
  return moveSibling(items, id, target.id);
}

/** Id generator for new items: slug-ish label plus a random suffix to stay unique. */
export function newMenuItemId(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'a')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'punkt';
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function allIds(items: MenuItem[]): Set<string> {
  const out = new Set<string>();
  const walk = (list: MenuItem[]) => {
    for (const item of list) {
      out.add(item.id);
      if (item.children) walk(item.children);
    }
  };
  walk(items);
  return out;
}
