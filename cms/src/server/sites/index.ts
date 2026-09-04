/**
 * Site resolution (multi-tenancy). Maps the request host to a `sites` row,
 * falls back to the default site (first active site), and caches the list of
 * active sites in memory for 60 s so public pages never hit the database just
 * to find out which newspaper they are rendering.
 *
 *   const { site, settings } = await getPublicSite();   // in public pages (host header)
 *   const site = await getSiteByHost('www.elvebyen.no:3000');
 *
 * Mutations that change `sites` (settings, domains, activation) must call
 * `invalidateSiteCache()` afterwards.
 */
import { asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { cache } from 'react';

import { db } from '@/db';
import { sites, type Site } from '@/db/schema';
import { parseSiteSettings, type SiteSettings } from '@/lib/validation/site';

export const SITE_CACHE_TTL_MS = 60_000;

type SiteCache = { sites: Site[]; expiresAt: number };

const g = globalThis as unknown as { __deskenSiteCache?: SiteCache | null };

async function loadActiveSites(): Promise<Site[]> {
  const now = Date.now();
  const cached = g.__deskenSiteCache;
  if (cached && cached.expiresAt > now) return cached.sites;
  const rows = await db.select().from(sites).where(eq(sites.isActive, true)).orderBy(asc(sites.createdAt));
  g.__deskenSiteCache = { sites: rows, expiresAt: now + SITE_CACHE_TTL_MS };
  return rows;
}

/** Drop the in-memory site cache (call after any change to the `sites` table). */
export function invalidateSiteCache(): void {
  g.__deskenSiteCache = null;
}

/**
 * Normalise a Host header value for matching: lower-case, no port, no
 * surrounding whitespace, no trailing dot. `www.` is handled by the matcher.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  // Take the first value when proxies join several hosts with commas.
  const comma = h.indexOf(',');
  if (comma !== -1) h = h.slice(0, comma).trim();
  // IPv6 literal "[::1]:3000" → "[::1]".
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    h = end === -1 ? h : h.slice(0, end + 1);
  } else {
    const colon = h.indexOf(':');
    if (colon !== -1) h = h.slice(0, colon);
  }
  if (h.endsWith('.')) h = h.slice(0, -1);
  return h || null;
}

function hostCandidates(host: string): string[] {
  const list = [host];
  if (host.startsWith('www.')) list.push(host.slice(4));
  else list.push(`www.${host}`);
  return list;
}

/** Find the site whose `domains` contains the host (port stripped, `www.` optional). */
export async function getSiteByHost(host: string | null): Promise<Site | null> {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  const candidates = hostCandidates(normalized);
  const all = await loadActiveSites();
  for (const site of all) {
    const domains = site.domains.map((d) => normalizeHost(d)).filter((d): d is string => d !== null);
    if (candidates.some((c) => domains.includes(c))) return site;
  }
  return null;
}

/** First active site by creation date. Throws when the installation has no site yet. */
export async function getDefaultSite(): Promise<Site> {
  const all = await loadActiveSites();
  const first = all[0];
  if (!first) {
    throw new Error('Ingen aktiv nettavis er satt opp. Kjør `pnpm db:seed` eller opprett et nettsted.');
  }
  return first;
}

/** Look up a site by id (active or not). */
export async function getSiteById(id: string): Promise<Site | null> {
  const cached = g.__deskenSiteCache;
  if (cached && cached.expiresAt > Date.now()) {
    const hit = cached.sites.find((s) => s.id === id);
    if (hit) return hit;
  }
  const rows = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listActiveSites(): Promise<Site[]> {
  return [...(await loadActiveSites())];
}

/** Complete, validated settings for a site (stored JSON may be sparse). */
export function getSiteSettings(site: Pick<Site, 'settings'>): SiteSettings {
  return parseSiteSettings(site.settings);
}

/**
 * Resolve the site for the current public request from the Host header
 * (X-Forwarded-Host when TRUST_PROXY). Memoised per request with React cache().
 */
export const getPublicSite = cache(async (): Promise<{ site: Site; settings: SiteSettings }> => {
  const { env } = await import('@/env');
  const h = await headers();
  const host = (env.TRUST_PROXY ? h.get('x-forwarded-host') : null) ?? h.get('host');
  const site = (await getSiteByHost(host)) ?? (await getDefaultSite());
  return { site, settings: getSiteSettings(site) };
});
