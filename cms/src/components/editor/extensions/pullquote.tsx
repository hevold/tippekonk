'use client';
/**
 * Pullquote (uthevet sitat): one or more paragraphs set large, with an
 * optional `cite` attribute for who said it.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Trash } from 'lucide-react';

import { useEditorHost } from '../editor-host';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenPullquote: {
      insertPullquote: () => ReturnType;
      togglePullquote: () => ReturnType;
    };
  }
}

function PullquoteView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const cite = typeof node.attrs.cite === 'string' ? node.attrs.cite : '';
  return (
    <NodeViewWrapper
      as="figure"
      className="ed-node ed-pullquote pullquote"
      data-selected={selected ? 'true' : undefined}
    >
      {!host.readOnly ? (
        <div className="ed-node-toolbar" contentEditable={false}>
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            data-variant="danger"
            onClick={() => deleteNode()}
            aria-label={t('editor.pullquote.remove')}
            title={t('editor.pullquote.remove')}
          >
            <Trash aria-hidden />
          </button>
        </div>
      ) : null}
      <NodeViewContent<'blockquote'> as="blockquote" />
      <div contentEditable={false}>
        {host.readOnly ? (
          cite ? (
            <figcaption>{cite}</figcaption>
          ) : null
        ) : (
          <input
            className="ed-input ed-cite"
            aria-label={t('editor.pullquote.cite')}
            placeholder={t('editor.pullquote.citePlaceholder')}
            value={cite}
            onChange={(e) => updateAttributes({ cite: e.target.value })}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const DeskenPullquote = Node.create({
  name: 'pullquote',
  group: 'block',
  content: 'paragraph+',
  isolating: true,
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      cite: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cite') ?? el.querySelector('figcaption')?.textContent ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="pullquote"]' }, { tag: 'figure.pullquote' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'pullquote',
        'data-cite': node.attrs.cite || null,
        class: 'pullquote',
      }),
      ['blockquote', {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PullquoteView);
  },

  addCommands() {
    return {
      insertPullquote:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { cite: '' }, content: [{ type: 'paragraph' }] }),
      togglePullquote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    };
  },
});
