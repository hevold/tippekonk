'use client';
/**
 * ArticleEditor — the TipTap 3 rich-text editor for article bodies and
 * live-blog posts. Produces and accepts ContentDoc JSON (see
 * lib/content/types.ts); `onChange` is debounced (300 ms).
 *
 *   <ArticleEditor
 *     value={doc}
 *     onChange={setDoc}
 *     onMediaPick={() => openMediaPicker()}      // resolves Media | null
 *     onArticlePick={() => openArticlePicker()}  // resolves { id, title } | null
 *     onSave={save}                              // Mod-S
 *     placeholder="Skriv brødteksten her …"
 *   />
 *
 * Node views read callbacks through <EditorHostProvider>. Images are shown
 * via `mediaUrl(media, width)` — pass the media area's helper, or rely on
 * the default `/media/<key>` fallback.
 */
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';

import type { Media } from '@/db/schema';
import { EMPTY_DOC, type ContentDoc } from '@/lib/content/types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import type { SiteSettings } from '@/lib/validation/site';

import { EditorFooter } from './editor-footer';
import {
  defaultMediaUrl,
  EditorHostProvider,
  type EditorHost,
  type EditorMedia,
  type PickedArticle,
  type PickedLiveBlog,
} from './editor-host';
import { buildExtensions, setSaveHandler } from './extensions';
import { SlashCommandMenu } from './extensions/slash-command';
import { LinkBubbleMenu, type LinkBubbleHandle } from './link-bubble-menu';
import { EditorToolbar } from './toolbar';
import { sameJson, useDebouncedCallback } from './utils';

import './editor.css';

export type ArticleEditorProps = {
  value: ContentDoc;
  onChange: (doc: ContentDoc) => void;
  /** Open the media library; resolve with the chosen media or null. */
  onMediaPick?: () => Promise<Media | null>;
  /** Open an article picker for "Les også" blocks. */
  onArticlePick?: () => Promise<PickedArticle | null>;
  /** Open a live blog picker for live blog blocks. */
  onLiveBlogPick?: () => Promise<PickedLiveBlog | null>;
  /** Called on Mod-S. */
  onSave?: () => void;
  /** Image URL builder; defaults to the largest variant ≤ width under /media/. */
  mediaUrl?: (media: EditorMedia, width?: number) => string;
  placeholder?: string;
  readOnly?: boolean;
  siteSettings?: SiteSettings;
  articleId?: string;
  /** Compact mode for live-blog posts: fewer tools, smaller min-height. */
  compact?: boolean;
  autoFocus?: boolean;
  /** Known titles for related-article ids (display only). */
  relatedTitles?: Record<string, string>;
  /** Known titles for live blog ids (display only). */
  liveBlogTitles?: Record<string, string>;
  /** Hide the toolbar / footer (e.g. when the host renders its own). */
  hideToolbar?: boolean;
  hideFooter?: boolean;
  className?: string;
  /** Accessible name for the editable region. */
  label?: string;
  /** Extra content rendered above the footer (e.g. validation hints). */
  children?: ReactNode;
};

export const EDITOR_CHANGE_DEBOUNCE_MS = 300;

export function ArticleEditor({
  value,
  onChange,
  onMediaPick,
  onArticlePick,
  onLiveBlogPick,
  onSave,
  mediaUrl,
  placeholder,
  readOnly = false,
  articleId,
  compact = false,
  autoFocus = false,
  relatedTitles,
  liveBlogTitles,
  hideToolbar = false,
  hideFooter = false,
  className,
  label,
  children,
}: ArticleEditorProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const linkHandle = useRef<LinkBubbleHandle | null>(null);

  const lastEmitted = useRef<ContentDoc>(value ?? EMPTY_DOC);

  // The hook always invokes the latest `onChange`, so the editor (built once) never holds a stale callback.
  const debounced = useDebouncedCallback((doc: ContentDoc) => {
    lastEmitted.current = doc;
    onChange(doc);
  }, EDITOR_CHANGE_DEBOUNCE_MS);

  const resolvedPlaceholder =
    placeholder ?? (compact ? t('editor.placeholder.compact') : t('editor.placeholder.body'));

  const extensions = useMemo(
    () => buildExtensions({ placeholder: resolvedPlaceholder, compact }),
    [resolvedPlaceholder, compact],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions,
      content: value ?? EMPTY_DOC,
      editable: !readOnly,
      autofocus: autoFocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: cn('prose-editor', compact && 'prose-editor-compact'),
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': label ?? t('editor.label'),
          ...(articleId ? { 'data-article-id': articleId } : {}),
        },
      },
      onUpdate: ({ editor: e }) => {
        debounced.call(e.getJSON() as ContentDoc);
      },
    },
    [extensions],
  );

  // Keep editability and the Mod-S handler in sync.
  useEffect(() => {
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly);
  }, [editor, readOnly]);
  useEffect(() => {
    if (editor) setSaveHandler(editor, onSave);
  }, [editor, onSave]);

  // Accept external value changes (reload after conflict, restore revision) without echoing our own updates.
  useEffect(() => {
    if (!editor || !value) return;
    if (sameJson(value, lastEmitted.current)) return;
    if (sameJson(value, editor.getJSON())) {
      lastEmitted.current = value;
      return;
    }
    debounced.cancel();
    lastEmitted.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value, debounced]);

  // Seed display titles for related articles / live blogs.
  useEffect(() => {
    if (!editor) return;
    const related = editor.storage.relatedArticles as { titles: Map<string, string> } | undefined;
    if (related && relatedTitles)
      for (const [id, title] of Object.entries(relatedTitles)) related.titles.set(id, title);
    const live = editor.storage.liveBlog as { titles: Map<string, string> } | undefined;
    if (live && liveBlogTitles)
      for (const [id, title] of Object.entries(liveBlogTitles)) live.titles.set(id, title);
  }, [editor, relatedTitles, liveBlogTitles]);

  const host = useMemo<EditorHost>(
    () => ({
      t,
      readOnly,
      onMediaPick,
      onArticlePick,
      onLiveBlogPick,
      mediaUrl: mediaUrl ?? defaultMediaUrl,
    }),
    [t, readOnly, onMediaPick, onArticlePick, onLiveBlogPick, mediaUrl],
  );

  return (
    <EditorHostProvider value={host}>
      <div
        ref={containerRef}
        className={cn('desken-editor bg-surface border-border rounded-md border', className)}
        data-compact={compact ? 'true' : undefined}
        data-readonly={readOnly ? 'true' : undefined}
      >
        {editor && !hideToolbar && !readOnly ? (
          <EditorToolbar editor={editor} compact={compact} onLinkRequest={() => linkHandle.current?.open()} />
        ) : null}
        <EditorContent editor={editor} />
        {editor ? (
          <>
            <LinkBubbleMenu editor={editor} handleRef={linkHandle} />
            {!readOnly ? <SlashCommandMenu editor={editor} containerRef={containerRef} /> : null}
          </>
        ) : null}
        {children}
        {editor && !hideFooter ? <EditorFooter editor={editor} compact={compact} /> : null}
      </div>
    </EditorHostProvider>
  );
}
