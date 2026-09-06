/**
 * Layout preview for the admin editor. Resolves a (draft) LayoutDoc with a
 * `LayoutSource` that, unlike the website's, also honours pinned articles
 * that are still scheduled, so the desk can compose tomorrow's front page
 * today. The result is flattened to plain JSON for the client component.
 *
 *   const preview = await resolveDraftPreview(siteId, doc);
 */
import 'server-only';

import { mediaUrl } from '@/server/media/urls';
import { resolveLayout, type LayoutSource } from '@/lib/layout/engine';
import type { LayoutBlockType, LayoutDoc } from '@/lib/layout/types';
import {
  articlesByIds,
  listLiveBlogSummaries,
  mediaByIds,
  queryArticles,
  type ApiTeaser,
} from '@/server/public-api/queries';

export type PreviewTeaser = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  sectionName: string | null;
  status: string;
  access: 'open' | 'plus';
  publishedAt: string | null;
  isBreaking: boolean;
  isSponsored: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  bylines: string[];
  /** True when the article was pinned in this block (not auto-filled). */
  pinned: boolean;
};

export type PreviewLiveBlog = { id: string; title: string; slug: string; status: string };

export type PreviewBlock = {
  id: string;
  type: LayoutBlockType;
  span: number;
  title: string | null;
  articles: PreviewTeaser[];
  liveBlogs: PreviewLiveBlog[];
};

export type PreviewRow = {
  id: string;
  title: string | null;
  columns: 1 | 2 | 3 | 4;
  background: 'none' | 'muted' | 'accent';
  blocks: PreviewBlock[];
};

export type PreviewLayout = { rows: PreviewRow[] };

/** The preview source: pinned ids may be scheduled, auto-fill is published only. */
export function previewSource(siteId: string): LayoutSource {
  const statusById = new Map<string, string>();
  return {
    async byIds(ids) {
      const rows = await articlesByIds(siteId, ids, ['published', 'scheduled']);
      for (const r of rows) statusById.set(r.id, r.status);
      return rows;
    },
    async query(q) {
      const { items } = await queryArticles(siteId, {
        sectionId: q.sectionId,
        tagId: q.tagId,
        contentTypeKey: q.contentTypeKey,
        access: q.access,
        exclude: [...q.exclude],
        order: q.order,
        days: q.mostReadDays,
        limit: q.limit,
      });
      for (const r of items) statusById.set(r.id, r.status);
      return items;
    },
    liveBlogs: () => listLiveBlogSummaries(siteId, ['live']),
    media: (ids) => mediaByIds(siteId, ids),
  };
}

function isApiTeaser(value: unknown): value is ApiTeaser {
  return Boolean(value) && typeof value === 'object' && 'status' in (value as object);
}

export async function resolveDraftPreview(siteId: string, doc: LayoutDoc): Promise<PreviewLayout> {
  const resolved = await resolveLayout(doc, previewSource(siteId));
  const rows: PreviewRow[] = resolved.rows.map((row) => ({
    id: row.id,
    title: row.title ?? null,
    columns: row.columns,
    background: row.background ?? 'none',
    blocks: row.blocks.map((block) => {
      const pinnedIds = new Set((block.items ?? []).map((it) => it.articleId));
      return {
        id: block.id,
        type: block.type,
        span: block.span ?? 1,
        title: block.settings.title ?? null,
        articles: block.articles.map((a) => ({
          id: a.id,
          title: a.title,
          kicker: a.kicker,
          lead: a.lead,
          sectionName: a.sectionName,
          status: isApiTeaser(a) ? a.status : 'published',
          access: a.access,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
          isBreaking: a.isBreaking,
          isSponsored: a.isSponsored,
          imageUrl: a.featuredMedia ? mediaUrl(a.featuredMedia, 320) : null,
          imageAlt: a.featuredMedia?.alt ?? null,
          bylines: a.bylines.map((b) => b.name),
          pinned: pinnedIds.has(a.id),
        })),
        liveBlogs: (block.liveBlogs ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          slug: l.slug,
          status: l.status,
        })),
      };
    }),
  }));
  return { rows };
}
