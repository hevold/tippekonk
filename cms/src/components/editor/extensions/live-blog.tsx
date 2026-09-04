'use client';
/**
 * Live blog node: embeds a live blog (direktestudio) by id. The public page
 * renders it as a live feed; the editor shows which one is linked.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Radio, Replace, Trash } from 'lucide-react';
import { useState } from 'react';

import { useEditorHost } from '../editor-host';

export type LiveBlogStorage = { titles: Map<string, string> };

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenLiveBlog: {
      insertLiveBlog: (liveBlogId?: string) => ReturnType;
    };
  }
  interface Storage {
    liveBlog: LiveBlogStorage;
  }
}

function LiveBlogView({ node, editor, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const id = typeof node.attrs.liveBlogId === 'string' ? node.attrs.liveBlogId : '';
  const storage = editor.storage.liveBlog as LiveBlogStorage;
  const [manualId, setManualId] = useState(id);

  const pick = async () => {
    if (!host.onLiveBlogPick) return;
    const picked = await host.onLiveBlogPick();
    if (!picked) return;
    storage.titles.set(picked.id, picked.title);
    updateAttributes({ liveBlogId: picked.id });
  };

  return (
    <NodeViewWrapper
      as="aside"
      className="ed-node ed-live"
      data-selected={selected ? 'true' : undefined}
      contentEditable={false}
      style={{ padding: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="ed-node-label">
          <Radio aria-hidden style={{ width: '0.9rem', height: '0.9rem' }} />
          {t('editor.live.label')}
        </span>
        {!host.readOnly ? (
          <span style={{ display: 'flex', gap: '2px' }}>
            {host.onLiveBlogPick ? (
              <button type="button" className="ed-btn" data-variant="outline" onClick={pick}>
                <Replace aria-hidden /> {id ? t('editor.live.change') : t('editor.live.choose')}
              </button>
            ) : null}
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              data-variant="danger"
              onClick={() => deleteNode()}
              aria-label={t('editor.live.remove')}
              title={t('editor.live.remove')}
            >
              <Trash aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.9rem' }}>
        {id ? (
          <div className="ed-related-item">
            <span className="ed-related-item-title">
              {storage.titles.get(id) ?? t('editor.live.unknown')}
            </span>
            <span className="ed-related-item-id">{id.slice(0, 8)}</span>
          </div>
        ) : (
          <div className="ed-empty">{t('editor.live.empty')}</div>
        )}
      </div>
      {!host.readOnly && !host.onLiveBlogPick ? (
        <div className="ed-inline-form">
          <input
            className="ed-input"
            aria-label={t('editor.live.idLabel')}
            placeholder={t('editor.live.idPlaceholder')}
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            onBlur={() => updateAttributes({ liveBlogId: manualId.trim() })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateAttributes({ liveBlogId: manualId.trim() });
              }
            }}
          />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const DeskenLiveBlog = Node.create({
  name: 'liveBlog',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addStorage(): LiveBlogStorage {
    return { titles: new Map<string, string>() };
  },

  addAttributes() {
    return {
      liveBlogId: { default: '', parseHTML: (el) => el.getAttribute('data-live-blog-id') ?? '' },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="liveBlog"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'liveBlog',
        'data-live-blog-id': node.attrs.liveBlogId || null,
        class: 'live-blog-embed',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LiveBlogView);
  },

  addCommands() {
    return {
      insertLiveBlog:
        (liveBlogId = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { liveBlogId } }),
    };
  },
});
