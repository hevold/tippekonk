'use client';
/**
 * Factbox (faktaboks): a titled aside with its own block content. Isolating,
 * so Enter/Backspace never merge it with surrounding paragraphs.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Trash } from 'lucide-react';

import { useEditorHost } from '../editor-host';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenFactbox: {
      insertFactbox: (title?: string) => ReturnType;
      toggleFactbox: () => ReturnType;
    };
  }
}

function FactboxView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
  return (
    <NodeViewWrapper
      as="aside"
      className="ed-node ed-factbox factbox"
      data-selected={selected ? 'true' : undefined}
    >
      {!host.readOnly ? (
        <div className="ed-node-toolbar" contentEditable={false}>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            data-variant="danger"
            onClick={() => deleteNode()}
            aria-label={t('editor.factbox.remove')}
            title={t('editor.factbox.remove')}
          >
            <Trash aria-hidden />
          </button>
        </div>
      ) : null}
      <div contentEditable={false}>
        {host.readOnly ? (
          title ? (
            <h3 className="factbox-title">{title}</h3>
          ) : null
        ) : (
          <input
            className="ed-input ed-factbox-title"
            aria-label={t('editor.factbox.title')}
            placeholder={t('editor.factbox.titlePlaceholder')}
            value={title}
            onChange={(e) => updateAttributes({ title: e.target.value })}
          />
        )}
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const DeskenFactbox = Node.create({
  name: 'factbox',
  group: 'block',
  content: 'block+',
  isolating: true,
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? el.querySelector('h3')?.textContent ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="factbox"]' }, { tag: 'aside.factbox' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'factbox',
        'data-title': node.attrs.title || null,
        class: 'factbox',
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FactboxView);
  },

  addCommands() {
    return {
      insertFactbox:
        (title = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { title },
            content: [{ type: 'paragraph' }],
          }),
      toggleFactbox:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});
