'use client';
/**
 * Host context for the article editor: callbacks and helpers that node views
 * (image, gallery, related articles …) need but cannot receive as props,
 * since TipTap instantiates them. `<ArticleEditor>` provides it around the
 * editor content; node views read it with `useEditorHost()`.
 */
import { createContext, useContext } from 'react';

import type { Media } from '@/db/schema';
import { createT, type T } from '@/lib/i18n';

/** The subset of a media row the editor needs to show an image. */
export type EditorMedia = Pick<
  Media,
  'id' | 'storageKey' | 'variants' | 'kind' | 'alt' | 'caption' | 'credit'
> &
  Partial<Pick<Media, 'width' | 'height' | 'filename'>>;

export type PickedArticle = { id: string; title: string };
export type PickedLiveBlog = { id: string; title: string };

export type EditorHost = {
  t: T;
  readOnly: boolean;
  /** Open the media library; resolves with the chosen media or null when cancelled. */
  onMediaPick?: () => Promise<Media | null>;
  /** Open an article picker for related articles. Without it, ids are entered as text. */
  onArticlePick?: () => Promise<PickedArticle | null>;
  /** Open a live blog picker. Without it, ids are entered as text. */
  onLiveBlogPick?: () => Promise<PickedLiveBlog | null>;
  /** URL for an image at (roughly) the given width. */
  mediaUrl: (media: EditorMedia, width?: number) => string;
};

/**
 * Default URL builder: the largest generated variant not wider than `width`,
 * else the original under /media/<key>. Mirrors `mediaUrl()` in the media
 * area without importing server code.
 */
export function defaultMediaUrl(media: EditorMedia, width?: number): string {
  const variants = media.variants && typeof media.variants === 'object' ? Object.values(media.variants) : [];
  if (width && variants.length) {
    const candidates = variants
      .filter((v) => v && typeof v.width === 'number' && typeof v.key === 'string')
      .sort((a, b) => a.width - b.width);
    const fit = [...candidates].reverse().find((v) => v.width <= width) ?? candidates[candidates.length - 1];
    if (fit) return `/media/${fit.key}`;
  }
  return `/media/${media.storageKey}`;
}

const EditorHostContext = createContext<EditorHost>({
  t: createT('nb'),
  readOnly: false,
  mediaUrl: defaultMediaUrl,
});

export const EditorHostProvider = EditorHostContext.Provider;

export function useEditorHost(): EditorHost {
  return useContext(EditorHostContext);
}
