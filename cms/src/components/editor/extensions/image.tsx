'use client';
/**
 * Image node: a media-library image with caption, credit, alt and size.
 * Attrs mirror the ContentDoc `image` node (see lib/content/types.ts).
 * The node view shows the picture with inline fields; alt is highlighted
 * when missing because publishing requires it.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Replace, Trash } from 'lucide-react';
import { useId } from 'react';

import { useEditorHost } from '../editor-host';

export type ImageSize = 'normal' | 'wide' | 'full';

export type ImageAttrs = {
  mediaId: string | null;
  src: string | null;
  alt: string;
  caption: string;
  credit: string;
  size: ImageSize;
  width: number | null;
  height: number | null;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenImage: {
      insertImage: (attrs: Partial<ImageAttrs> & { mediaId: string }) => ReturnType;
    };
  }
}

function ImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const attrs = node.attrs as ImageAttrs;
  const ids = { alt: useId(), caption: useId(), credit: useId() };
  const missingAlt = !attrs.alt?.trim();

  const replace = async () => {
    if (!host.onMediaPick) return;
    const media = await host.onMediaPick();
    if (!media) return;
    updateAttributes({
      mediaId: media.id,
      src: host.mediaUrl(media, 1280),
      alt: media.alt ?? '',
      caption: attrs.caption || (media.caption ?? ''),
      credit: media.credit ?? '',
      width: media.width ?? null,
      height: media.height ?? null,
    });
  };

  return (
    <NodeViewWrapper
      as="figure"
      className="ed-node ed-image"
      data-size={attrs.size ?? 'normal'}
      data-selected={selected ? 'true' : undefined}
      contentEditable={false}
    >
      {!host.readOnly ? (
        <div className="ed-node-toolbar" role="toolbar" aria-label={t('editor.image.label')}>
          <div className="ed-size-toggle" role="group" aria-label={t('editor.image.size')}>
            {(['normal', 'wide', 'full'] as ImageSize[]).map((size) => (
              <button
                key={size}
                type="button"
                className="ed-btn"
                aria-pressed={attrs.size === size}
                onClick={() => updateAttributes({ size })}
              >
                {t(`editor.image.size.${size}`)}
              </button>
            ))}
          </div>
          {host.onMediaPick ? (
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              onClick={replace}
              aria-label={t('editor.image.replace')}
              title={t('editor.image.replace')}
            >
              <Replace aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="ed-btn ed-btn-icon"
            data-variant="danger"
            onClick={() => deleteNode()}
            aria-label={t('editor.image.remove')}
            title={t('editor.image.remove')}
          >
            <Trash aria-hidden />
          </button>
        </div>
      ) : null}
      {attrs.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- editor preview of a stored media file
        <img
          src={attrs.src}
          alt={attrs.alt ?? ''}
          width={attrs.width ?? undefined}
          height={attrs.height ?? undefined}
          draggable={false}
        />
      ) : (
        <div className="ed-empty">{t('editor.image.missing')}</div>
      )}
      {!host.readOnly ? (
        <div className="ed-fields">
          <label className="sr-only" htmlFor={ids.caption}>
            {t('editor.image.caption')}
          </label>
          <input
            id={ids.caption}
            className="ed-input"
            placeholder={t('editor.image.caption')}
            value={attrs.caption ?? ''}
            onChange={(e) => updateAttributes({ caption: e.target.value })}
          />
          <div className="ed-fields" data-cols="2" style={{ marginTop: 0 }}>
            <div>
              <label className="sr-only" htmlFor={ids.credit}>
                {t('editor.image.credit')}
              </label>
              <input
                id={ids.credit}
                className="ed-input"
                placeholder={t('editor.image.credit')}
                value={attrs.credit ?? ''}
                onChange={(e) => updateAttributes({ credit: e.target.value })}
              />
            </div>
            <div>
              <label className="sr-only" htmlFor={ids.alt}>
                {t('editor.image.alt')}
              </label>
              <input
                id={ids.alt}
                className="ed-input"
                placeholder={t('editor.image.altPlaceholder')}
                aria-invalid={missingAlt || undefined}
                title={missingAlt ? t('editor.image.altRequired') : undefined}
                value={attrs.alt ?? ''}
                onChange={(e) => updateAttributes({ alt: e.target.value })}
              />
            </div>
          </div>
        </div>
      ) : (
        <figcaption>
          {attrs.caption} {attrs.credit ? <span className="credit">{attrs.credit}</span> : null}
        </figcaption>
      )}
    </NodeViewWrapper>
  );
}

export const DeskenImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mediaId: { default: null, parseHTML: (el) => el.getAttribute('data-media-id') },
      src: {
        default: null,
        parseHTML: (el) => el.querySelector('img')?.getAttribute('src') ?? el.getAttribute('src'),
      },
      alt: {
        default: '',
        parseHTML: (el) => el.querySelector('img')?.getAttribute('alt') ?? el.getAttribute('alt') ?? '',
      },
      caption: { default: '', parseHTML: (el) => el.getAttribute('data-caption') ?? '' },
      credit: { default: '', parseHTML: (el) => el.getAttribute('data-credit') ?? '' },
      size: { default: 'normal', parseHTML: (el) => el.getAttribute('data-size') ?? 'normal' },
      width: {
        default: null,
        parseHTML: (el) => Number(el.querySelector('img')?.getAttribute('width')) || null,
      },
      height: {
        default: null,
        parseHTML: (el) => Number(el.querySelector('img')?.getAttribute('height')) || null,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="image"]' }, { tag: 'img[data-media-id]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const a = node.attrs as ImageAttrs;
    const caption = [a.caption, a.credit].filter(Boolean).join(' ');
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'image',
        'data-media-id': a.mediaId,
        'data-size': a.size,
        'data-caption': a.caption || null,
        'data-credit': a.credit || null,
      }),
      ['img', { src: a.src, alt: a.alt, width: a.width, height: a.height }],
      ...(caption ? [['figcaption', {}, caption] as const] : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              size: 'normal',
              alt: '',
              caption: '',
              credit: '',
              src: null,
              width: null,
              height: null,
              ...attrs,
            },
          }),
    };
  },
});
