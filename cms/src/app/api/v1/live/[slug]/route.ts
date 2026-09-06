/** GET /api/v1/live/:slug — a live blog (live or ended) with its posts and key events. */
import { getPublicLiveBlog } from '@/server/live';
import { apiHandler, apiOptions, ApiError } from '@/server/public-api/handler';
import { serializeLiveBlog } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler<{ slug: string }>(async ({ site, params, baseUrl }) => {
  const slug = decodeURIComponent(params.slug).trim().toLowerCase();
  const result = slug ? await getPublicLiveBlog(site.id, slug) : null;
  if (!result) throw new ApiError(404, 'not_found', 'Fant ikke direktesendingen.');
  return {
    data: serializeLiveBlog(baseUrl, result.blog, result.posts, result.keyEvents, result.media),
    meta: { postCount: result.posts.length },
  };
});

export const OPTIONS = apiOptions;
