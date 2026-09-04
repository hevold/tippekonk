'use client';
/**
 * Related articles ("Les også") node: an ordered list of article ids. Titles
 * are display-only and kept in extension storage (seeded from the editor's
 * `relatedTitles` prop and picker results) — the document stores ids only.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ArrowLeft, ArrowRight, Newspaper, Plus, Trash } from 'lucide-react';
import { useState } from 'react';

import { useEditorHost } from '../editor-host';

export type RelatedArticlesStorage = {
  titles: Map<string, string>;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenRelatedArticles: {
      insertRelatedArticles: (articleIds?: string[]) => ReturnType;
    };
  }
  interface Storage {
    relatedArticles: RelatedArticlesStorage;
  }
}

function readIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
}

function RelatedArticlesView({ node, editor, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const ids = readIds(node.attrs.articleIds);
  const storage = editor.storage.relatedArticles as RelatedArticlesStorage;
  const [manualId, setManualId] = useState('');

  const setIds = (next: string[]) => updateAttributes({ articleIds: [...new Set(next)] });

  const pick = async () => {
    if (!host.onArticlePick) return;
    const picked = await host.onArticlePick();
    if (!picked) return;
    storage.titles.set(picked.id, picked.title);
    setIds([...ids, picked.id]);
  };

  const addManual = () => {
    const id = manualId.trim();
    if (!id) return;
    setIds([...ids, id]);
    setManualId('');
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    const next = [...ids];
    const [id] = next.splice(index, 1);
    next.splice(target, 0, id!);
    setIds(next);
  };

  return (
    <NodeViewWrapper
      as="aside"
      className="ed-node ed-related related"
      data-selected={selected ? 'true' : undefined}
      contentEditable={false}
      style={{ padding: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="ed-node-label">
          <Newspaper aria-hidden style={{ width: '0.9rem', height: '0.9rem' }} />
          {t('editor.related.label')} · {t('editor.related.count', { count: ids.length })}
        </span>
        {!host.readOnly ? (
          <span style={{ display: 'flex', gap: '2px' }}>
            {host.onArticlePick ? (
              <button type="button" className="ed-btn" data-variant="outline" onClick={pick}>
                <Plus aria-hidden /> {t('editor.related.add')}
              </button>
            ) : null}
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              data-variant="danger"
              onClick={() => deleteNode()}
              aria-label={t('editor.related.remove')}
              title={t('editor.related.remove')}
            >
              <Trash aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      {ids.length === 0 ? (
        <div className="ed-empty" style={{ marginTop: '0.5rem' }}>
          {t('editor.related.empty')}
        </div>
      ) : (
        <ul className="ed-related-list">
          {ids.map((id, index) => (
            <li key={id} className="ed-related-item">
              <span className="ed-related-item-title">
                {storage.titles.get(id) ?? t('editor.related.unknown')}
              </span>
              <span className="ed-related-item-id">{id.slice(0, 8)}</span>
              {!host.readOnly ? (
                <>
                  <button
                    type="button"
                    className="ed-btn ed-btn-icon"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={t('editor.related.moveUp')}
                    title={t('editor.related.moveUp')}
                  >
                    <ArrowLeft aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ed-btn ed-btn-icon"
                    onClick={() => move(index, 1)}
                    disabled={index === ids.length - 1}
                    aria-label={t('editor.related.moveDown')}
                    title={t('editor.related.moveDown')}
                  >
                    <ArrowRight aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ed-btn ed-btn-icon"
                    data-variant="danger"
                    onClick={() => setIds(ids.filter((v) => v !== id))}
                    aria-label={t('editor.related.removeItem')}
                    title={t('editor.related.removeItem')}
                  >
                    <Trash aria-hidden />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!host.readOnly && !host.onArticlePick ? (
        <div className="ed-inline-form">
          <input
            className="ed-input"
            aria-label={t('editor.related.idLabel')}
            placeholder={t('editor.related.idPlaceholder')}
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addManual();
              }
            }}
          />
          <button
            type="button"
            className="ed-btn"
            data-variant="outline"
            onClick={addManual}
            disabled={!manualId.trim()}
          >
            <Plus aria-hidden /> {t('editor.related.add')}
          </button>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const DeskenRelatedArticles = Node.create({
  name: 'relatedArticles',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addStorage(): RelatedArticlesStorage {
    return { titles: new Map<string, string>() };
  },

  addAttributes() {
    return {
      articleIds: {
        default: [],
        parseHTML: (el) =>
          (el.getAttribute('data-article-ids') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        renderHTML: (attrs) => ({ 'data-article-ids': readIds(attrs.articleIds).join(',') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="relatedArticles"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'relatedArticles', class: 'related' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(RelatedArticlesView);
  },

  addCommands() {
    return {
      insertRelatedArticles:
        (articleIds = []) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { articleIds } }),
    };
  },
});
