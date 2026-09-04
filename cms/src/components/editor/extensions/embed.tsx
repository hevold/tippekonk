'use client';
/**
 * Embed node: a third-party URL classified through the whitelist in
 * lib/content/embed.ts. The node view previews YouTube/Vimeo/NRK in a
 * sandboxed iframe and shows a link card for everything else. Pasting a
 * recognised video URL into an empty paragraph inserts an embed directly.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Globe, Trash } from 'lucide-react';
import { useState } from 'react';

import { displayHost, EMBED_PROVIDER_LABELS, embedInfo } from '@/lib/content/embed';
import type { EmbedProvider } from '@/lib/content/types';

import { useEditorHost } from '../editor-host';

export type EmbedAttrs = {
  provider: EmbedProvider;
  url: string;
  title: string;
  aspect: '16:9' | '4:3' | '1:1';
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenEmbed: {
      insertEmbed: (url?: string, title?: string) => ReturnType;
    };
  }
}

const IFRAME_PROVIDERS = new Set<EmbedProvider>(['youtube', 'vimeo', 'nrk']);
const AUTO_EMBED_PROVIDERS = new Set<EmbedProvider>(['youtube', 'vimeo', 'nrk']);

/** Build attrs from a URL; empty URL yields an "unset" embed the user fills in. */
export function embedAttrsFromUrl(url: string, title = ''): EmbedAttrs {
  const info = embedInfo(url);
  return {
    provider: info?.provider ?? 'generic',
    url: url.trim(),
    title,
    aspect: info?.aspect ?? '16:9',
  };
}

function EmbedView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const attrs = node.attrs as EmbedAttrs;
  const [draft, setDraft] = useState(attrs.url ?? '');
  // Reset the draft when the stored URL changes from outside (derived-state pattern).
  const [seenUrl, setSeenUrl] = useState(attrs.url ?? '');
  if ((attrs.url ?? '') !== seenUrl) {
    setSeenUrl(attrs.url ?? '');
    setDraft(attrs.url ?? '');
  }

  const info = attrs.url ? embedInfo(attrs.url) : null;
  const provider = info?.provider ?? attrs.provider ?? 'generic';
  const label = EMBED_PROVIDER_LABELS[provider] ?? 'Lenke';
  const invalid = draft.trim().length > 0 && !embedInfo(draft);

  const commit = () => {
    const next = draft.trim();
    if (!next || next === attrs.url) return;
    if (!embedInfo(next)) return;
    updateAttributes(embedAttrsFromUrl(next, attrs.title));
  };

  return (
    <NodeViewWrapper
      className="ed-node ed-embed"
      data-selected={selected ? 'true' : undefined}
      contentEditable={false}
      style={{ padding: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="ed-node-label">
          <Globe aria-hidden style={{ width: '0.9rem', height: '0.9rem' }} />
          {t('editor.embed.label')} · {label}
        </span>
        {!host.readOnly ? (
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            data-variant="danger"
            onClick={() => deleteNode()}
            aria-label={t('editor.embed.remove')}
            title={t('editor.embed.remove')}
          >
            <Trash aria-hidden />
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        {info?.embedUrl && IFRAME_PROVIDERS.has(provider) ? (
          <div className="ed-embed-preview" data-aspect={attrs.aspect ?? info.aspect}>
            <iframe
              src={info.embedUrl}
              title={attrs.title || `${label}: ${displayHost(attrs.url)}`}
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : attrs.url ? (
          <div className="ed-embed-card">
            <span className="ed-embed-card-provider">{label}</span>
            <span>{attrs.title || t('editor.embed.linkCard')}</span>
            <span className="ed-embed-card-url">{attrs.url}</span>
          </div>
        ) : (
          <div className="ed-empty">{t('editor.embed.empty')}</div>
        )}
      </div>

      {!host.readOnly ? (
        <div className="ed-fields">
          <input
            className="ed-input"
            type="url"
            inputMode="url"
            aria-label={t('editor.embed.url')}
            placeholder={t('editor.embed.urlPlaceholder')}
            aria-invalid={invalid || undefined}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
          />
          <input
            className="ed-input"
            aria-label={t('editor.embed.title')}
            placeholder={t('editor.embed.titlePlaceholder')}
            value={attrs.title ?? ''}
            onChange={(e) => updateAttributes({ title: e.target.value })}
          />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export const DeskenEmbed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: { default: 'generic', parseHTML: (el) => el.getAttribute('data-provider') ?? 'generic' },
      url: { default: '', parseHTML: (el) => el.getAttribute('data-url') ?? el.getAttribute('href') ?? '' },
      title: { default: '', parseHTML: (el) => el.getAttribute('data-title') ?? '' },
      aspect: { default: '16:9', parseHTML: (el) => el.getAttribute('data-aspect') ?? '16:9' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const a = node.attrs as EmbedAttrs;
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'embed',
        'data-provider': a.provider,
        'data-url': a.url,
        'data-title': a.title || null,
        'data-aspect': a.aspect,
        class: 'embed',
      }),
      ['a', { href: a.url, rel: 'noopener noreferrer nofollow', target: '_blank' }, a.title || a.url],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },

  addCommands() {
    return {
      insertEmbed:
        (url = '', title = '') =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: embedAttrsFromUrl(url, title) }),
    };
  },

  addProseMirrorPlugins() {
    const nodeType = this.type;
    return [
      new Plugin({
        key: new PluginKey('deskenEmbedPaste'),
        props: {
          handlePaste(view, event) {
            const text = event.clipboardData?.getData('text/plain')?.trim();
            if (!text || /\s/.test(text) || !/^https?:\/\//i.test(text)) return false;
            const info = embedInfo(text);
            if (!info || !AUTO_EMBED_PROVIDERS.has(info.provider) || !info.embedUrl) return false;
            const { $from, empty } = view.state.selection;
            // Only take over when pasting into an empty paragraph; otherwise it becomes a link.
            if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0) return false;
            const node = nodeType.create(embedAttrsFromUrl(text));
            const pos = $from.before();
            const tr = view.state.tr.replaceWith(pos, pos + $from.parent.nodeSize, node);
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
