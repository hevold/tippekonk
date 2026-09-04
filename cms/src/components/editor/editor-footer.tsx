'use client';
/**
 * Editor footer: word and character counts, reading time, and the slash
 * hint. Counts come from TipTap's CharacterCount storage.
 */
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

import { readingTimeMinutes } from '@/lib/content/text';
import { formatNumber } from '@/lib/text';

import { useEditorHost } from './editor-host';

export function EditorFooter({ editor, compact }: { editor: Editor; compact?: boolean }) {
  const host = useEditorHost();
  const t = host.t;
  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const cc = e.storage.characterCount as { words: () => number; characters: () => number } | undefined;
      return { words: cc ? cc.words() : 0, characters: cc ? cc.characters() : 0 };
    },
  });
  const words = stats?.words ?? 0;
  const characters = stats?.characters ?? 0;
  return (
    <div className="ed-footer" aria-live="polite">
      <div className="ed-footer-stats">
        <span>{t('editor.footer.words', { count: words, n: formatNumber(words) })}</span>
        <span>{t('editor.footer.characters', { count: characters, n: formatNumber(characters) })}</span>
        {!compact ? (
          <span>{t('editor.footer.readingTime', { minutes: readingTimeMinutes(words) })}</span>
        ) : null}
      </div>
      {!host.readOnly ? <span>{t('editor.footer.slashHint')}</span> : null}
    </div>
  );
}
