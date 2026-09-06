'use server';
/**
 * Layout editor server actions (/admin/forside). Reads need `layout:edit`,
 * publishing needs `layout:publish`. Every mutation goes through the
 * service in ./index.ts (validate → persist → audit → revalidate).
 */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { articles, media, sections, type ArticleStatus } from '@/db/schema';
import { layoutDocSchema } from '@/lib/layout/engine';
import type { LayoutDoc } from '@/lib/layout/types';
import { layoutKeySchema } from '@/lib/validation/layout';
import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';
import { mediaUrl } from '@/server/media/urls';

import { discardDraft, getLayout, hasUnpublishedChanges, publishLayout, saveDraft } from './index';
import { resolveDraftPreview, type PreviewLayout } from './preview';

/* -------------------------------------------------------------------------- */
/*  DTOs                                                                       */
/* -------------------------------------------------------------------------- */

export type LayoutDto = {
  key: string;
  name: string;
  draft: LayoutDoc;
  published: LayoutDoc | null;
  publishedAt: string | null;
  updatedAt: string;
  hasDraftChanges: boolean;
};

/** What the pinned-item list and the search results show for an article. */
export type LayoutArticleInfo = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  status: ArticleStatus;
  sectionName: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  access: 'open' | 'plus';
  isSponsored: boolean;
  thumbnailUrl: string | null;
};

const saveSchema = z.object({ key: layoutKeySchema, doc: layoutDocSchema });
const keySchema = z.object({ key: layoutKeySchema });
const searchSchema = z.object({
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const lookupSchema = z.object({ ids: z.array(uuidSchema).max(200) });
const previewSchema = z.object({ doc: layoutDocSchema });

function toDto(layout: Awaited<ReturnType<typeof getLayout>>): LayoutDto {
  return {
    key: layout.key,
    name: layout.name,
    draft: layout.draft,
    published: layout.published,
    publishedAt: layout.publishedAt ? layout.publishedAt.toISOString() : null,
    updatedAt: layout.updatedAt.toISOString(),
    hasDraftChanges: hasUnpublishedChanges(layout),
  };
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                    */
/* -------------------------------------------------------------------------- */

/** Load (creating on demand) — used by the list page's "Opprett". */
export async function createLayoutAction(input: unknown): Promise<ActionResult<LayoutDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { key } = keySchema.parse(input);
    return toDto(await getLayout(ctx.site.id, key, ctx.user.id));
  });
}

export async function saveLayoutDraftAction(input: unknown): Promise<ActionResult<LayoutDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { key, doc } = saveSchema.parse(input);
    return toDto(await saveDraft(ctx, key, doc));
  });
}

export async function publishLayoutAction(input: unknown): Promise<ActionResult<LayoutDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:publish');
    const { key } = keySchema.parse(input);
    return toDto(await publishLayout(ctx, key));
  });
}

export async function discardLayoutDraftAction(input: unknown): Promise<ActionResult<LayoutDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { key } = keySchema.parse(input);
    return toDto(await discardDraft(ctx, key));
  });
}

export async function previewLayoutAction(input: unknown): Promise<ActionResult<PreviewLayout>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { doc } = previewSchema.parse(input);
    return resolveDraftPreview(ctx.site.id, doc);
  });
}

const infoColumns = {
  id: articles.id,
  title: articles.title,
  kicker: articles.kicker,
  lead: articles.lead,
  status: articles.status,
  sectionName: sections.name,
  publishedAt: articles.publishedAt,
  scheduledAt: articles.scheduledAt,
  access: articles.access,
  isSponsored: articles.isSponsored,
  featuredMedia: media,
};

type InfoRow = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  status: ArticleStatus;
  sectionName: string | null;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  access: 'open' | 'plus';
  isSponsored: boolean;
  featuredMedia: typeof media.$inferSelect | null;
};

function toInfo(r: InfoRow): LayoutArticleInfo {
  const m = r.featuredMedia && !r.featuredMedia.deletedAt ? r.featuredMedia : null;
  return {
    id: r.id,
    title: r.title || '(Uten tittel)',
    kicker: r.kicker,
    lead: r.lead,
    status: r.status,
    sectionName: r.sectionName,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : null,
    access: r.access,
    isSponsored: r.isSponsored,
    thumbnailUrl: m ? mediaUrl(m, 320) : null,
  };
}

function infoSelect() {
  return db
    .select(infoColumns)
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(media, eq(media.id, articles.featuredMediaId));
}

/** Published and scheduled articles by title (ILIKE + Norwegian full text), newest first. */
export async function searchLayoutArticlesAction(input: unknown): Promise<ActionResult<LayoutArticleInfo[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { q, limit } = searchSchema.parse(input ?? {});
    const clauses = [
      eq(articles.siteId, ctx.site.id),
      isNull(articles.deletedAt),
      inArray(articles.status, ['published', 'scheduled']),
    ];
    const term = q.trim();
    if (term) {
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      clauses.push(
        or(
          ilike(articles.title, pattern),
          sql`${articles.search} @@ websearch_to_tsquery('norwegian', ${term})`,
        )!,
      );
    }
    const rows = await infoSelect()
      .where(and(...clauses))
      .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.scheduledAt})`), desc(articles.id))
      .limit(limit);
    return rows.map(toInfo);
  });
}

/** Details for articles already pinned in a layout (any status, so stale pins are visible). */
export async function lookupLayoutArticlesAction(input: unknown): Promise<ActionResult<LayoutArticleInfo[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('layout:edit');
    const { ids } = lookupSchema.parse(input);
    if (!ids.length) return [];
    const rows = await infoSelect().where(and(eq(articles.siteId, ctx.site.id), inArray(articles.id, ids)));
    return rows.map(toInfo);
  });
}
