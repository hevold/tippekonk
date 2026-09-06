/** GET /api/v1/tags — every tag alphabetically, with published article counts. */
import { apiHandler, apiOptions } from '@/server/public-api/handler';
import { listApiTags } from '@/server/public-api/queries';
import { serializeTag } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async ({ site, baseUrl }) => {
  const tags = await listApiTags(site.id);
  return { data: tags.map((t) => serializeTag(baseUrl, t)), meta: { total: tags.length } };
});

export const OPTIONS = apiOptions;
