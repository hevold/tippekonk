/**
 * Norwegian screen-reader announcements and instructions for the dnd-kit
 * contexts in the layout editor. The `describe` callback turns a drag id
 * into a human label ("rad 2", "blokken Toppsak").
 */
import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

export type DragKind = 'row' | 'block' | 'item' | 'search';

/** Drag ids are prefixed so one DndContext can host rows, blocks, pinned items and search results. */
export function parseDragId(id: string | number): { kind: DragKind; id: string } | null {
  const s = String(id);
  const sep = s.indexOf(':');
  if (sep === -1) return null;
  const kind = s.slice(0, sep) as DragKind;
  if (!['row', 'block', 'item', 'search'].includes(kind)) return null;
  return { kind, id: s.slice(sep + 1) };
}

export function dragId(kind: DragKind, id: string): string {
  return `${kind}:${id}`;
}

export const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Trykk mellomrom for å ta tak i elementet. Bruk piltastene for å flytte det, mellomrom for å slippe og Escape for å avbryte.',
};

export function buildAnnouncements(describe: (id: string | number) => string): Announcements {
  return {
    onDragStart({ active }) {
      return `Tok tak i ${describe(active.id)}.`;
    },
    onDragOver({ active, over }) {
      return over
        ? `${describe(active.id)} er over ${describe(over.id)}.`
        : `${describe(active.id)} er ikke over noe område.`;
    },
    onDragEnd({ active, over }) {
      return over
        ? `${describe(active.id)} ble sluppet på ${describe(over.id)}.`
        : `${describe(active.id)} ble sluppet.`;
    },
    onDragCancel({ active }) {
      return `Flyttingen av ${describe(active.id)} ble avbrutt.`;
    },
  };
}
