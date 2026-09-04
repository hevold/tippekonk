/**
 * Pure helpers for the command palette and global keyboard shortcuts
 * (kept out of the .tsx so they can be unit-tested in the node environment).
 */

/** True when the keydown event is the platform "mod" (⌘ on macOS, Ctrl elsewhere) plus `key`. */
export function isModKey(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'key'>,
  key: string,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === key.toLowerCase();
}

/** True when the event target is an editable control where single-key shortcuts must not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"], .ProseMirror') !== null
  );
}

export type Searchable = { label: string; keywords?: string[] };

/** Every whitespace-separated part of `query` must occur in label + keywords (case-insensitive). */
export function matchesQuery(item: Searchable, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('nb-NO');
  if (!q) return true;
  const hay = [item.label, ...(item.keywords ?? [])].join(' ').toLocaleLowerCase('nb-NO');
  return q.split(/\s+/).every((part) => hay.includes(part));
}
