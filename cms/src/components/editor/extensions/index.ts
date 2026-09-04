/**
 * Extension set for the Desken article editor. `buildExtensions()` returns
 * the full list; the live-blog composer uses the same set in compact mode.
 */
import { Extension, type Editor, type Extensions } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

import { isSafeHref } from '@/lib/content/schema';

import { DeskenEmbed } from './embed';
import { DeskenFactbox } from './factbox';
import { DeskenGallery } from './gallery';
import { DeskenImage } from './image';
import { DeskenLiveBlog } from './live-blog';
import { DeskenPullquote } from './pullquote';
import { DeskenRelatedArticles } from './related-articles';
import { SlashCommand } from './slash-command';

export {
  DeskenEmbed,
  DeskenFactbox,
  DeskenGallery,
  DeskenImage,
  DeskenLiveBlog,
  DeskenPullquote,
  DeskenRelatedArticles,
  SlashCommand,
};
export { embedAttrsFromUrl } from './embed';
export type { ImageAttrs, ImageSize } from './image';
export type { GalleryItem } from './gallery';
export type { EmbedAttrs } from './embed';
export { buildSlashItems, SlashCommandMenu } from './slash-command';

export type BuildExtensionsOptions = {
  placeholder: string;
  /** Compact mode (live posts): no tables. */
  compact?: boolean;
};

export type SaveShortcutStorage = { onSave: (() => void) | null };

declare module '@tiptap/core' {
  interface Storage {
    deskenSaveShortcut: SaveShortcutStorage;
  }
}

/**
 * Mod-S → `storage.onSave`, so the browser's "save page" never triggers while
 * writing. The editor component keeps the callback in storage up to date.
 */
export const SaveShortcut = Extension.create({
  name: 'deskenSaveShortcut',
  addStorage(): SaveShortcutStorage {
    return { onSave: null };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-s': () => {
        (this.storage as SaveShortcutStorage).onSave?.();
        return true;
      },
    };
  },
});

/** Update the Mod-S handler on a live editor. */
export function setSaveHandler(editor: Editor, onSave: (() => void) | undefined): void {
  const storage = editor.storage.deskenSaveShortcut as SaveShortcutStorage | undefined;
  if (storage) storage.onSave = onSave ?? null;
}

export function buildExtensions(opts: BuildExtensionsOptions): Extensions {
  const base: Extensions = [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: false,
      horizontalRule: {},
      dropcursor: { width: 2 },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: null, rel: null, class: null },
        isAllowedUri: (url) => isSafeHref(url),
      },
      // Keeps a trailing paragraph so block nodes at the end stay reachable.
      trailingNode: {},
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
    Highlight,
    Subscript,
    Superscript,
    Placeholder.configure({ placeholder: opts.placeholder, includeChildren: false }),
    CharacterCount.configure({ limit: null }),
    DeskenImage,
    DeskenGallery,
    DeskenEmbed,
    DeskenFactbox,
    DeskenPullquote,
    DeskenRelatedArticles,
    DeskenLiveBlog,
    SaveShortcut,
  ];
  if (!opts.compact) {
    base.push(
      Table.configure({ resizable: false, HTMLAttributes: { class: 'editor-table' } }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommand,
    );
  } else {
    base.push(SlashCommand);
  }
  return base;
}
