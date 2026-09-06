/**
 * Per-request context for public pages: the site (from the Host header),
 * its validated settings, the chrome data, the absolute base URL and the
 * metadata helper context. Memoised with React cache() so the layout, the
 * page and generateMetadata share one resolution.
 */
import 'server-only';

import { cache } from 'react';

import type { Site } from '@/db/schema';
import { setRequestLocale } from '@/lib/i18n';
import type { SiteSettings } from '@/lib/validation/site';
import { getPublicSite } from '@/server/sites';

import { getSiteChrome, type SiteChrome } from './chrome';
import type { SiteInfo } from './json-ld';
import type { MetaContext } from './metadata';
import { getBaseUrl } from './urls';

export type PublicPageContext = {
  site: Site;
  settings: SiteSettings;
  chrome: SiteChrome;
  baseUrl: string;
  meta: MetaContext;
  jsonLd: SiteInfo;
};

export const getPublicPageContext = cache(async (): Promise<PublicPageContext> => {
  const { site, settings } = await getPublicSite();
  setRequestLocale(site.locale === 'nn' ? 'nn' : 'nb');
  const [chrome, baseUrl] = await Promise.all([getSiteChrome(site, settings), getBaseUrl(site)]);
  const defaultImage = chrome.ogImage ?? chrome.logo;
  return {
    site,
    settings,
    chrome,
    baseUrl,
    meta: { site, settings, baseUrl, defaultImage },
    jsonLd: { site, settings, baseUrl, logo: chrome.logo },
  };
});

/** First value of a search param. */
export function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Positive page number from "?side=". */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number.parseInt(firstParam(v) ?? '1', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}
