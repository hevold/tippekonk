/** GET /api/v1/site — name, theme, editorial info, menus, sections and content types. */
import { parseSiteSettings } from '@/lib/validation/site';
import { apiHandler, apiOptions } from '@/server/public-api/handler';
import { listApiContentTypes, listApiMenus, listApiSections } from '@/server/public-api/queries';
import { serializeSite } from '@/server/public-api/serializers';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async ({ site, baseUrl }) => {
  const [menus, sections, contentTypes] = await Promise.all([
    listApiMenus(site.id),
    listApiSections(site.id),
    listApiContentTypes(site.id),
  ]);
  return {
    data: serializeSite(baseUrl, site, parseSiteSettings(site.settings), menus, sections, contentTypes),
  };
});

export const OPTIONS = apiOptions;
