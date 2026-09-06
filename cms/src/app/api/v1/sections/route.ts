/** GET /api/v1/sections — active sections in menu order, with published article counts. */
import { apiHandler, apiOptions } from '@/server/public-api/handler';
import { listApiSections } from '@/server/public-api/queries';
import { serializeSection } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async ({ site, baseUrl }) => {
  const sections = await listApiSections(site.id);
  return { data: sections.map((s) => serializeSection(baseUrl, s)), meta: { total: sections.length } };
});

export const OPTIONS = apiOptions;
