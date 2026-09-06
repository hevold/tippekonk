/**
 * Front page: the published `front` layout (or the default layout) rendered
 * by <LayoutRenderer>, plus Organization and WebSite JSON-LD.
 */
import type { Metadata } from 'next';

import { JsonLd } from '@/components/public/json-ld';
import { LayoutRenderer } from '@/components/public/layout-renderer';
import { t } from '@/lib/i18n';
import { getPublicPageContext } from '@/server/public/context';
import { organizationJsonLd, webSiteJsonLd } from '@/server/public/json-ld';
import { listMetadata } from '@/server/public/metadata';
import { getFrontLayout } from '@/server/public/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getPublicPageContext();
  const meta = listMetadata(ctx.meta, { title: null, path: '/' });
  return {
    ...meta,
    title: { absolute: ctx.site.tagline ? `${ctx.site.name} – ${ctx.site.tagline}` : ctx.site.name },
  };
}

export default async function FrontPage() {
  const ctx = await getPublicPageContext();
  const layout = await getFrontLayout(ctx.site.id);
  const sections = ctx.chrome.sections.map((s) => ({ id: s.id, slug: s.slug, name: s.name }));
  return (
    <>
      <h1 className="sr-only">{ctx.site.name}</h1>
      <JsonLd data={[organizationJsonLd(ctx.jsonLd), webSiteJsonLd(ctx.jsonLd)]} />
      {layout.rows.length ? (
        <LayoutRenderer layout={layout} sections={sections} plusLabel={ctx.settings.paywall.label} />
      ) : (
        <p className="text-muted py-16 text-center">{t('public.list.empty')}</p>
      )}
    </>
  );
}
