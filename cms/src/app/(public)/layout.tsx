/**
 * Public site layout: resolves the site from the Host header, sets the
 * request locale, injects the theme and wraps every page in the masthead /
 * breaking bar / footer frame. Pages under (public) are dynamic because the
 * site depends on the request; reads are cached per site in the queries.
 */
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import '@/components/public/public.css';

import { SiteShell } from '@/components/public/site-shell';
import { I18nProvider } from '@/lib/i18n/client';
import { getPublicPageContext } from '@/server/public/context';
import { ogLocale, titleSuffix } from '@/server/public/metadata';
import { themeColor } from '@/server/public/theme';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getPublicPageContext();
  const suffix = titleSuffix(ctx);
  return {
    metadataBase: new URL(ctx.baseUrl),
    title: { default: ctx.site.name, template: `%s${suffix}` },
    description: ctx.settings.seo.defaultDescription || ctx.site.tagline || undefined,
    applicationName: ctx.site.name,
    generator: 'Desken',
    alternates: {
      types: { 'application/rss+xml': [{ url: '/rss.xml', title: ctx.site.name }] },
    },
    openGraph: { siteName: ctx.site.name, locale: ogLocale(ctx.site.locale), type: 'website' },
    robots: { index: true, follow: true },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const ctx = await getPublicPageContext();
  return { width: 'device-width', initialScale: 1, themeColor: themeColor(ctx.settings.theme) };
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const ctx = await getPublicPageContext();
  const h = await headers();
  const currentPath = h.get('x-pathname') ?? undefined;
  const locale = ctx.site.locale === 'nn' ? 'nn' : 'nb';
  return (
    <I18nProvider locale={locale}>
      <SiteShell site={ctx.site} settings={ctx.settings} chrome={ctx.chrome} currentPath={currentPath}>
        {children}
      </SiteShell>
    </I18nProvider>
  );
}
