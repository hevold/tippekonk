/**
 * Short link /a/<id>: 301 to the canonical article URL (SPEC 5.3). When the
 * article has no section the canonical *is* /a/<id>, so we render nothing
 * here and instead redirect to the section-less article page.
 *
 * INTEGRATION: articles without a section currently have no dedicated page
 * beyond this redirect target; the editor requires a section before
 * publishing (SPEC 5.4), so every published article has a canonical path.
 */
import { z } from 'zod';

import { publicPaths } from '@/config/routes';
import { getArticleById } from '@/server/public/queries';
import { getPublicSite } from '@/server/sites';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response('Not found', { status: 404 });
  const { site } = await getPublicSite();
  const article = await getArticleById(site.id, id);
  if (!article || !article.section) return new Response('Not found', { status: 404 });
  const location = publicPaths.article(article.section.slug, article.slug);
  return new Response(null, {
    status: 301,
    headers: { Location: location, 'Cache-Control': 'public, max-age=300' },
  });
}
