/**
 * GET /api/v1/articles/:id — one published article with body (ContentDoc)
 * and pre-rendered `html`.
 */
import { uuidSchema } from '@/lib/validation/common';
import { apiHandler, apiOptions, ApiError } from '@/server/public-api/handler';
import { getApiArticle } from '@/server/public-api/queries';
import { serializeArticle } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler<{ id: string }>(async ({ site, params, baseUrl }) => {
  const parsed = uuidSchema.safeParse(params.id);
  if (!parsed.success) throw new ApiError(404, 'not_found', 'Fant ikke saken.');
  const article = await getApiArticle(site.id, parsed.data);
  if (!article) throw new ApiError(404, 'not_found', 'Fant ikke saken.');
  return { data: serializeArticle(baseUrl, article) };
});

export const OPTIONS = apiOptions;
