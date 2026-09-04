'use client';
/**
 * Bubble menu for links: appears on a text selection or when the cursor is
 * inside a link. Lets the writer set/edit the URL, toggle "open in new tab",
 * open the target, or remove the link. Hrefs are validated with the same
 * rule as the sanitiser so unsafe schemes never enter the document.
 */
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Check, ExternalLink, Link, Unlink, X } from 'lucide-react';
import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { isSafeHref } from '@/lib/content/schema';

import { useEditorHost } from './editor-host';

export type LinkBubbleHandle = { open: () => void };

type Props = { editor: Editor; handleRef?: Ref<LinkBubbleHandle> };

function normalizeHref(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('/') || v.startsWith('#')) return v;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(v)) return `mailto:${v}`;
  return `https://${v}`;
}

export function LinkBubbleMenu({ editor, handleRef }: Props) {
  const host = useEditorHost();
  const t = host.t;
  const [editing, setEditing] = useState(false);
  const [href, setHref] = useState('');
  const [blank, setBlank] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const checkId = useId();

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const attrs = e.getAttributes('link') as { href?: string; target?: string };
      return {
        isLink: e.isActive('link'),
        href: typeof attrs.href === 'string' ? attrs.href : '',
        target: attrs.target === '_blank',
        empty: e.state.selection.empty,
      };
    },
  });

  const openEditor = () => {
    setHref(state?.href ?? '');
    setBlank(Boolean(state?.target));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useImperativeHandle(handleRef, () => ({ open: openEditor }));

  // Mod-K opens the link editor when there is a selection or an active link.
  useEffect(() => {
    const dom = editor.view.dom;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!editor.state.selection.empty || editor.isActive('link')) openEditor();
      }
    };
    dom.addEventListener('keydown', onKey);
    return () => dom.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openEditor reads fresh state via refs each call
  }, [editor]);

  if (!state || host.readOnly) return null;

  // The editing form only makes sense with a selection or an existing link.
  const showEditor = editing && (state.isLink || !state.empty);

  const apply = () => {
    const value = normalizeHref(href);
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setEditing(false);
      return;
    }
    if (!isSafeHref(value)) return;
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: value, target: blank ? '_blank' : null, rel: blank ? 'noopener noreferrer' : null })
      .run();
    setEditing(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEditing(false);
  };

  const invalid = href.trim().length > 0 && !isSafeHref(normalizeHref(href));

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="deskenLinkBubble"
      updateDelay={80}
      shouldShow={({ editor: e, from, to }) => {
        if (!e.isEditable) return false;
        if (e.isActive('image') || e.isActive('embed') || e.isActive('gallery')) return false;
        if (e.isActive('link')) return true;
        if (from === to) return false;
        return e.state.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
      options={{ placement: 'top', offset: 8 }}
    >
      <div
        className="ed-bubble"
        role="group"
        aria-label={t('editor.link.label')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {showEditor ? (
          <>
            <label htmlFor={inputId} className="sr-only">
              {t('editor.link.url')}
            </label>
            <input
              ref={inputRef}
              id={inputId}
              className="ed-input"
              type="text"
              inputMode="url"
              placeholder={t('editor.link.placeholder')}
              aria-invalid={invalid || undefined}
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditing(false);
                  editor.commands.focus();
                }
              }}
            />
            <label className="ed-bubble-check" htmlFor={checkId}>
              <input
                id={checkId}
                type="checkbox"
                checked={blank}
                onChange={(e) => setBlank(e.target.checked)}
              />
              {t('editor.link.newTab')}
            </label>
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              onClick={apply}
              disabled={invalid}
              aria-label={t('editor.link.apply')}
              title={t('editor.link.apply')}
            >
              <Check aria-hidden />
            </button>
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              onClick={() => setEditing(false)}
              aria-label={t('editor.link.cancel')}
              title={t('editor.link.cancel')}
            >
              <X aria-hidden />
            </button>
          </>
        ) : state.isLink ? (
          <>
            <a
              className="ed-btn"
              href={state.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
              title={state.href}
            >
              <ExternalLink aria-hidden /> {state.href}
            </a>
            <span className="ed-bubble-sep" />
            <button type="button" className="ed-btn" onClick={openEditor}>
              <Link aria-hidden /> {t('editor.link.edit')}
            </button>
            <button type="button" className="ed-btn" data-variant="danger" onClick={remove}>
              <Unlink aria-hidden /> {t('editor.link.remove')}
            </button>
          </>
        ) : (
          <button type="button" className="ed-btn" onClick={openEditor}>
            <Link aria-hidden /> {t('editor.link.add')}
          </button>
        )}
      </div>
    </BubbleMenu>
  );
}
