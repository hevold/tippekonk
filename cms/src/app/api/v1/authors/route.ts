/** GET /api/v1/authors — active bylines/authors with portrait and published article counts. */
import { apiHandler, apiOptions } from '@/server/public-api/handler';
import { listApiAuthors } from '@/server/public-api/queries';
import { serializeAuthor } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async ({ site, baseUrl }) => {
  const authors = await listApiAuthors(site.id);
  return { data: authors.map((a) => serializeAuthor(baseUrl, a)), meta: { total: authors.length } };
});

export const OPTIONS = apiOptions;
