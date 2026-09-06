/**
 * GET /api/v1/articles?section=&tag=&q=&since=&page=&per_page=
 * Published article teasers, newest first. `section` and `tag` accept a slug
 * or an id; `since` is an ISO instant (articles updated at or after it).
 */
import { z } from 'zod';

import {
  apiHandler,
  apiOptions,
  ApiError,
  paginationMeta,
  paginationQuerySchema,
  parseQuery,
} from '@/server/public-api/handler';
import { getSectionBySlugOrId, getTagBySlugOrId, queryArticles } from '@/server/public-api/queries';
import { serializeTeaser } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

const querySchema = paginationQuerySchema.extend({
  section: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(120).optional(),
  q: z.string().trim().max(200).optional(),
  since: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'since må være en ISO 8601-dato' });
        return z.NEVER;
      }
      return d;
    }),
  access: z.enum(['open', 'plus']).optional(),
  content_type: z.string().trim().max(64).optional(),
});

export const GET = apiHandler(async ({ site, url, baseUrl }) => {
  const q = parseQuery(querySchema, url);
  let sectionId: string | undefined;
  let tagId: string | undefined;
  if (q.section) {
    const section = await getSectionBySlugOrId(site.id, q.section);
    if (!section) throw new ApiError(404, 'not_found', 'Fant ikke seksjonen.');
    sectionId = section.id;
  }
  if (q.tag) {
    const tag = await getTagBySlugOrId(site.id, q.tag);
    if (!tag) throw new ApiError(404, 'not_found', 'Fant ikke stikkordet.');
    tagId = tag.id;
  }
  const { items, total } = await queryArticles(site.id, {
    sectionId,
    tagId,
    q: q.q,
    since: q.since,
    access: q.access,
    contentTypeKey: q.content_type,
    limit: q.per_page,
    offset: (q.page - 1) * q.per_page,
    order: q.since ? 'updated' : 'published',
  });
  return {
    data: items.map((a) => serializeTeaser(baseUrl, a)),
    meta: paginationMeta(q, total),
  };
});

export const OPTIONS = apiOptions;
