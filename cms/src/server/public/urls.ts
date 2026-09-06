/**
 * Absolute URLs for the public site (canonical links, feeds, sitemap,
 * JSON-LD). The base is derived from the request (host + forwarded proto)
 * so a multi-site install answers with the right hostname; outside a
 * request (scripts, tests) it falls back to the site's first domain or
 * APP_URL.
 */
import 'server-only';

import { headers } from 'next/headers';

import type { Site } from '@/db/schema';
import { env } from '@/env';
import { normalizeHost } from '@/server/sites';

/** Pure: pick a base URL from what we know about the request and the site. */
export function baseUrlFor(site: Pick<Site, 'domains'>, host: string | null, proto: string | null): string {
  const normalized = normalizeHost(host);
  if (normalized) {
    const port = host && /:(\d+)$/.exec(host.trim())?.[1];
    const isLocal = normalized === 'localhost' || normalized === '127.0.0.1' || normalized.endsWith('.local');
    const scheme = proto === 'https' || proto === 'http' ? proto : isLocal ? 'http' : 'https';
    const portSuffix =
      port && !((scheme === 'http' && port === '80') || (scheme === 'https' && port === '443'))
        ? `:${port}`
        : '';
    return `${scheme}://${normalized}${portSuffix}`;
  }
  const domain = site.domains.map((d) => normalizeHost(d)).find((d): d is string => Boolean(d));
  if (domain && domain !== 'localhost' && domain !== '127.0.0.1') return `https://${domain}`;
  return env.APP_URL.replace(/\/+$/, '');
}

/** Base URL for the current request ("https://www.elvebyen.no"), no trailing slash. */
export async function getBaseUrl(site: Pick<Site, 'domains'>): Promise<string> {
  try {
    const h = await headers();
    const host = (env.TRUST_PROXY ? h.get('x-forwarded-host') : null) ?? h.get('host');
    const proto = env.TRUST_PROXY ? h.get('x-forwarded-proto') : null;
    return baseUrlFor(site, host, proto);
  } catch {
    return baseUrlFor(site, null, null);
  }
}

export { absoluteUrl } from './paths';
