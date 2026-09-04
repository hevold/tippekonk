'use client';
/**
 * Slash-command menu: typing "/" at the start of an empty line (or after a
 * space) opens a filtered list of blocks to insert. Implemented as a small
 * ProseMirror plugin that tracks the "/query" range in extension storage,
 * plus a React menu (<SlashCommandMenu>) rendered by the editor that
 * subscribes to editor transactions. Keyboard navigation is intercepted by
 * the plugin while the menu is open.
 */
import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  Globe,
  Heading2,
  Heading3,
  Image,
  Images,
  Info,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Newspaper,
  Radio,
  Table,
  TextQuote,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { T } from '@/lib/i18n';

import { useEditorHost, type EditorHost } from '../editor-host';

export type SlashCommandStorage = {
  open: boolean;
  /** Position of the "/" character. */
  from: number;
  /** Key handler registered by the React menu while open. */
  onKeyDown: ((event: KeyboardEvent) => boolean) | null;
};

declare module '@tiptap/core' {
  interface Storage {
    slashCommand: SlashCommandStorage;
  }
}

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab']);

function slashStorage(editor: Editor): SlashCommandStorage {
  return editor.storage.slashCommand as SlashCommandStorage;
}
function setSlashOpen(editor: Editor, open: boolean): void {
  slashStorage(editor).open = open;
}
function setSlashKeyHandler(editor: Editor, handler: SlashCommandStorage['onKeyDown']): void {
  slashStorage(editor).onKeyDown = handler;
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addStorage(): SlashCommandStorage {
    return { open: false, from: 0, onKeyDown: null };
  },

  addProseMirrorPlugins() {
    const storage = this.storage as SlashCommandStorage;
    return [
      new Plugin({
        key: new PluginKey('deskenSlashCommand'),
        props: {
          handleTextInput(view, from, _to, text) {
            if (text !== '/') return false;
            const { $from } = view.state.selection;
            if (!$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') return false;
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, ' ');
            if (before.length > 0 && !/\s$/.test(before)) return false;
            storage.open = true;
            storage.from = from;
            // Let ProseMirror insert the "/" itself; the menu opens on the next transaction.
            return false;
          },
          handleKeyDown(_view, event) {
            if (!storage.open || !storage.onKeyDown || !KEYS.has(event.key)) return false;
            return storage.onKeyDown(event);
          },
        },
      }),
      new Plugin({
        key: new PluginKey('deskenSlashCommandWatch'),
        view: () => ({
          update: (view) => {
            if (!storage.open) return;
            const { state } = view;
            const head = state.selection.head;
            if (head < storage.from + 1 || !state.selection.empty) {
              storage.open = false;
              return;
            }
            const slash = state.doc.textBetween(storage.from, storage.from + 1, undefined, ' ');
            if (slash !== '/') {
              storage.open = false;
              return;
            }
            const query = state.doc.textBetween(storage.from + 1, head, undefined, ' ');
            if (/\s/.test(query) || query.length > 30) storage.open = false;
          },
        }),
      }),
    ];
  },
});

export type SlashItem = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  group: 'text' | 'media' | 'blocks';
  run: (editor: Editor) => void;
  /** Hide when the host lacks a capability (e.g. no media picker). */
  enabled?: (caps: { hasMediaPick: boolean }) => boolean;
};

export function buildSlashItems(t: T, host: Pick<EditorHost, 'onMediaPick' | 'mediaUrl'>): SlashItem[] {
  return [
    {
      id: 'heading2',
      label: t('editor.slash.heading2'),
      description: t('editor.slash.heading2.desc'),
      keywords: ['h2', 'overskrift', 'tittel', 'mellomtittel'],
      icon: Heading2,
      group: 'text',
      run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      id: 'heading3',
      label: t('editor.slash.heading3'),
      description: t('editor.slash.heading3.desc'),
      keywords: ['h3', 'overskrift', 'undertittel'],
      icon: Heading3,
      group: 'text',
      run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
      id: 'bulletList',
      label: t('editor.slash.bulletList'),
      description: t('editor.slash.bulletList.desc'),
      keywords: ['liste', 'punkt', 'kulepunkt'],
      icon: List,
      group: 'text',
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'orderedList',
      label: t('editor.slash.orderedList'),
      description: t('editor.slash.orderedList.desc'),
      keywords: ['liste', 'nummer', 'tall'],
      icon: ListOrdered,
      group: 'text',
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: 'blockquote',
      label: t('editor.slash.blockquote'),
      description: t('editor.slash.blockquote.desc'),
      keywords: ['sitat', 'quote'],
      icon: TextQuote,
      group: 'text',
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: 'pullquote',
      label: t('editor.slash.pullquote'),
      description: t('editor.slash.pullquote.desc'),
      keywords: ['sitat', 'uthevet', 'pullquote'],
      icon: MessageSquareQuote,
      group: 'text',
      run: (e) => e.chain().focus().insertPullquote().run(),
    },
    {
      id: 'image',
      label: t('editor.slash.image'),
      description: t('editor.slash.image.desc'),
      keywords: ['bilde', 'foto', 'media'],
      icon: Image,
      group: 'media',
      enabled: (c) => c.hasMediaPick,
      run: (e) => {
        void host.onMediaPick?.().then((media) => {
          if (!media) return;
          e.chain()
            .focus()
            .insertImage({
              mediaId: media.id,
              src: host.mediaUrl(media, 1280),
              alt: media.alt ?? '',
              caption: media.caption ?? '',
              credit: media.credit ?? '',
              width: media.width ?? null,
              height: media.height ?? null,
            })
            .run();
        });
      },
    },
    {
      id: 'gallery',
      label: t('editor.slash.gallery'),
      description: t('editor.slash.gallery.desc'),
      keywords: ['galleri', 'bilder', 'bildeserie'],
      icon: Images,
      group: 'media',
      run: (e) => e.chain().focus().insertGallery().run(),
    },
    {
      id: 'embed',
      label: t('editor.slash.embed'),
      description: t('editor.slash.embed.desc'),
      keywords: ['embed', 'video', 'youtube', 'vimeo', 'nrk', 'lenke'],
      icon: Globe,
      group: 'media',
      run: (e) => e.chain().focus().insertEmbed().run(),
    },
    {
      id: 'factbox',
      label: t('editor.slash.factbox'),
      description: t('editor.slash.factbox.desc'),
      keywords: ['faktaboks', 'fakta', 'boks'],
      icon: Info,
      group: 'blocks',
      run: (e) => e.chain().focus().insertFactbox().run(),
    },
    {
      id: 'table',
      label: t('editor.slash.table'),
      description: t('editor.slash.table.desc'),
      keywords: ['tabell', 'table'],
      icon: Table,
      group: 'blocks',
      run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: 'relatedArticles',
      label: t('editor.slash.related'),
      description: t('editor.slash.related.desc'),
      keywords: ['relaterte', 'les også', 'saker', 'lenker'],
      icon: Newspaper,
      group: 'blocks',
      run: (e) => e.chain().focus().insertRelatedArticles().run(),
    },
    {
      id: 'liveBlog',
      label: t('editor.slash.live'),
      description: t('editor.slash.live.desc'),
      keywords: ['direkte', 'live', 'direktestudio'],
      icon: Radio,
      group: 'blocks',
      run: (e) => e.chain().focus().insertLiveBlog().run(),
    },
    {
      id: 'horizontalRule',
      label: t('editor.slash.hr'),
      description: t('editor.slash.hr.desc'),
      keywords: ['skillelinje', 'linje', 'hr'],
      icon: Minus,
      group: 'blocks',
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ];
}

function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.keywords.some((k) => k.includes(q)) ||
      it.id.toLowerCase().includes(q),
  );
}

type MenuState = { open: boolean; query: string; top: number; left: number };

/** The floating menu. Render once inside the editor container (position: relative). */
export function SlashCommandMenu({
  editor,
  containerRef,
}: {
  editor: Editor;
  containerRef: React.RefObject<HTMLElement | null>;
}): ReactNode {
  const host = useEditorHost();
  const t = host.t;
  const [state, setState] = useState<MenuState>({ open: false, query: '', top: 0, left: 0 });
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => buildSlashItems(t, host), [t, host]);
  const caps = useMemo(() => ({ hasMediaPick: Boolean(host.onMediaPick) }), [host.onMediaPick]);
  const visible = useMemo(
    () => filterItems(items, state.query).filter((it) => (it.enabled ? it.enabled(caps) : true)),
    [items, state.query, caps],
  );
  const groups = useMemo(() => {
    const order: SlashItem['group'][] = ['text', 'media', 'blocks'];
    return order
      .map((g) => ({ group: g, items: visible.filter((it) => it.group === g) }))
      .filter((g) => g.items.length);
  }, [visible]);

  // Track editor transactions to open/close and position the menu.
  useEffect(() => {
    const storage = slashStorage(editor);
    const sync = () => {
      if (!storage.open) {
        setState((s) => (s.open ? { ...s, open: false, query: '' } : s));
        return;
      }
      const head = editor.state.selection.head;
      const query = editor.state.doc.textBetween(storage.from + 1, head, undefined, ' ');
      let top = 0;
      let left = 0;
      try {
        const coords = editor.view.coordsAtPos(storage.from);
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          top = coords.bottom - rect.top + 4;
          left = Math.max(0, coords.left - rect.left);
        }
      } catch {
        /* position unavailable during re-render; keep previous */
      }
      setState({ open: true, query, top, left });
      setIndex(0);
    };
    editor.on('transaction', sync);
    editor.on('blur', () => {
      // Delay so clicks inside the menu register before it closes.
      setTimeout(() => {
        if (!editor.isFocused) {
          setSlashOpen(editor, false);
          sync();
        }
      }, 150);
    });
    return () => {
      editor.off('transaction', sync);
    };
  }, [editor, containerRef]);

  const execute = (item: SlashItem) => {
    const from = slashStorage(editor).from;
    const to = editor.state.selection.head;
    setSlashOpen(editor, false);
    editor.chain().focus().deleteRange({ from, to }).run();
    item.run(editor);
  };

  // Keyboard handling while open.
  useEffect(() => {
    if (!state.open) {
      setSlashKeyHandler(editor, null);
      return;
    }
    setSlashKeyHandler(editor, (event) => {
      switch (event.key) {
        case 'ArrowDown':
          setIndex((i) => (visible.length ? (i + 1) % visible.length : 0));
          return true;
        case 'ArrowUp':
          setIndex((i) => (visible.length ? (i - 1 + visible.length) % visible.length : 0));
          return true;
        case 'Enter':
        case 'Tab': {
          const item = visible[index];
          if (item) execute(item);
          else setSlashOpen(editor, false);
          return true;
        }
        case 'Escape':
          setSlashOpen(editor, false);
          setState((s) => ({ ...s, open: false }));
          return true;
        default:
          return false;
      }
    });
    return () => {
      setSlashKeyHandler(editor, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- execute closes over the stable editor instance
  }, [state.open, visible, index, editor]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [index, state.open]);

  if (!state.open || host.readOnly) return null;

  let flat = -1;
  return (
    <div
      ref={listRef}
      className="ed-slash-menu"
      role="listbox"
      aria-label={t('editor.slash.label')}
      style={{ top: state.top, left: state.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {groups.length === 0 ? (
        <div className="ed-slash-empty">{t('editor.slash.empty')}</div>
      ) : (
        groups.map((g) => (
          <div key={g.group}>
            <div className="ed-slash-group">{t(`editor.slash.group.${g.group}`)}</div>
            {g.items.map((item) => {
              flat += 1;
              const selected = flat === index;
              const Icon = item.icon;
              const myIndex = flat;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className="ed-slash-item"
                  onMouseEnter={() => setIndex(myIndex)}
                  onClick={() => execute(item)}
                >
                  <Icon aria-hidden />
                  <span>
                    <span className="ed-slash-item-label">{item.label}</span>
                    <span className="ed-slash-item-desc">{item.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
