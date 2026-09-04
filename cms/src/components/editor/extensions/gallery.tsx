'use client';
/**
 * Gallery node: an ordered set of media items with captions and credits.
 * Items live in a single `items` attr (JSON) so the document stays a
 * flat, validated structure — see the `gallery` node in lib/content/types.ts.
 */
import { mergeAttributes, Node, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { ArrowLeft, ArrowRight, Images, Plus, Trash } from 'lucide-react';

import { useEditorHost } from '../editor-host';

export type GalleryItem = {
  mediaId: string;
  src?: string;
  alt?: string;
  caption?: string;
  credit?: string;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    deskenGallery: {
      insertGallery: (items?: GalleryItem[]) => ReturnType;
    };
  }
}

function readItems(raw: unknown): GalleryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (i): i is GalleryItem => Boolean(i) && typeof i === 'object' && typeof i.mediaId === 'string',
  );
}

function GalleryView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const host = useEditorHost();
  const t = host.t;
  const items = readItems(node.attrs.items);

  const setItems = (next: GalleryItem[]) => updateAttributes({ items: next });

  const add = async () => {
    if (!host.onMediaPick) return;
    const media = await host.onMediaPick();
    if (!media) return;
    setItems([
      ...items,
      {
        mediaId: media.id,
        src: host.mediaUrl(media, 640),
        alt: media.alt ?? '',
        caption: media.caption ?? '',
        credit: media.credit ?? '',
      },
    ]);
  };

  const update = (index: number, patch: Partial<GalleryItem>) =>
    setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(target, 0, it!);
    setItems(next);
  };

  const remove = (index: number) => setItems(items.filter((_, i) => i !== index));

  return (
    <NodeViewWrapper
      className="ed-node ed-gallery"
      data-selected={selected ? 'true' : undefined}
      contentEditable={false}
      style={{ padding: '0.75rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="ed-node-label">
          <Images aria-hidden style={{ width: '0.9rem', height: '0.9rem' }} />
          {t('editor.gallery.label')} · {t('editor.gallery.count', { count: items.length })}
        </span>
        {!host.readOnly ? (
          <span style={{ display: 'flex', gap: '2px' }}>
            {host.onMediaPick ? (
              <button type="button" className="ed-btn" data-variant="outline" onClick={add}>
                <Plus aria-hidden /> {t('editor.gallery.add')}
              </button>
            ) : null}
            <button
              type="button"
              className="ed-btn ed-btn-icon"
              data-variant="danger"
              onClick={() => deleteNode()}
              aria-label={t('editor.gallery.remove')}
              title={t('editor.gallery.remove')}
            >
              <Trash aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="ed-empty" style={{ marginTop: '0.5rem' }}>
          {t('editor.gallery.empty')}
        </div>
      ) : (
        <div className="ed-gallery-grid">
          {items.map((item, index) => (
            <div key={`${item.mediaId}-${index}`} className="ed-gallery-item">
              {item.src ? (
                // eslint-disable-next-line @next/next/no-img-element -- editor preview of a stored media file
                <img src={item.src} alt={item.alt ?? ''} draggable={false} />
              ) : (
                <div className="ed-empty">{t('editor.image.missing')}</div>
              )}
              {!host.readOnly ? (
                <>
                  <input
                    className="ed-input"
                    aria-label={t('editor.image.caption')}
                    placeholder={t('editor.image.caption')}
                    value={item.caption ?? ''}
                    onChange={(e) => update(index, { caption: e.target.value })}
                  />
                  <input
                    className="ed-input"
                    aria-label={t('editor.image.credit')}
                    placeholder={t('editor.image.credit')}
                    value={item.credit ?? ''}
                    onChange={(e) => update(index, { credit: e.target.value })}
                  />
                  <input
                    className="ed-input"
                    aria-label={t('editor.image.alt')}
                    placeholder={t('editor.image.altPlaceholder')}
                    aria-invalid={!item.alt?.trim() || undefined}
                    value={item.alt ?? ''}
                    onChange={(e) => update(index, { alt: e.target.value })}
                  />
                  <div className="ed-gallery-item-actions">
                    <span>
                      <button
                        type="button"
                        className="ed-btn ed-btn-icon"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={t('editor.gallery.moveLeft')}
                        title={t('editor.gallery.moveLeft')}
                      >
                        <ArrowLeft aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="ed-btn ed-btn-icon"
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1}
                        aria-label={t('editor.gallery.moveRight')}
                        title={t('editor.gallery.moveRight')}
                      >
                        <ArrowRight aria-hidden />
                      </button>
                    </span>
                    <button
                      type="button"
                      className="ed-btn ed-btn-icon"
                      data-variant="danger"
                      onClick={() => remove(index)}
                      aria-label={t('editor.gallery.removeItem')}
                      title={t('editor.gallery.removeItem')}
                    >
                      <Trash aria-hidden />
                    </button>
                  </div>
                </>
              ) : (
                <figcaption style={{ fontSize: '0.8rem' }}>
                  {item.caption} {item.credit ? <span className="credit">{item.credit}</span> : null}
                </figcaption>
              )}
            </div>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const DeskenGallery = Node.create({
  name: 'gallery',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      items: {
        default: [],
        parseHTML: (el) => {
          try {
            return readItems(JSON.parse(el.getAttribute('data-items') ?? '[]'));
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({ 'data-items': JSON.stringify(readItems(attrs.items)) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="gallery"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'gallery', class: 'gallery' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryView);
  },

  addCommands() {
    return {
      insertGallery:
        (items = []) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { items } }),
    };
  },
});
