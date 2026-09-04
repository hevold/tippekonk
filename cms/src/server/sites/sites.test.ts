/**
 * Site resolution: host matching (port stripping, www., IPv6, proxies),
 * default site, id lookup, the 60 s in-memory cache and getPublicSite()
 * reading the Host header.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { sites } from '@/db/schema';
import { resetTestDb, seedMinimal, useTestDb } from '@/test/db';

const headerStore = { host: 'localhost:3000' as string | null, forwarded: null as string | null };

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => {
      if (name.toLowerCase() === 'host') return headerStore.host;
      if (name.toLowerCase() === 'x-forwarded-host') return headerStore.forwarded;
      return null;
    },
  }),
}));

import {
  getDefaultSite,
  getPublicSite,
  getSiteById,
  getSiteByHost,
  getSiteSettings,
  invalidateSiteCache,
  listActiveSites,
  normalizeHost,
} from './index';

let db: Db;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  invalidateSiteCache();
  headerStore.host = 'localhost:3000';
  headerStore.forwarded = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeHost', () => {
  it('lower-cases, trims and strips the port', () => {
    expect(normalizeHost(' Elvebyen.NO:3000 ')).toBe('elvebyen.no');
    expect(normalizeHost('localhost:3000')).toBe('localhost');
    expect(normalizeHost('127.0.0.1:3000')).toBe('127.0.0.1');
  });
  it('handles IPv6 literals, trailing dots and comma-joined values', () => {
    expect(normalizeHost('[::1]:3000')).toBe('[::1]');
    expect(normalizeHost('elvebyen.no.')).toBe('elvebyen.no');
    expect(normalizeHost('elvebyen.no, proxy.internal')).toBe('elvebyen.no');
  });
  it('returns null for empty input', () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
  });
});

describe('getSiteByHost', () => {
  it('matches domains with the port stripped and www. added or removed', async () => {
    const seeded = await seedMinimal(db);
    const [elvebyen] = await db
      .insert(sites)
      .values({ slug: 'elvebyen', name: 'Elvebyen Tidende', domains: ['elvebyen.no'] })
      .returning();
    const [fjellstad] = await db
      .insert(sites)
      .values({ slug: 'fjellstad', name: 'Fjellstad Avis', domains: ['www.fjellstad.no:8080'] })
      .returning();
    invalidateSiteCache();

    expect((await getSiteByHost('localhost:3000'))?.id).toBe(seeded.site.id);
    expect((await getSiteByHost('www.localhost'))?.id).toBe(seeded.site.id);
    expect((await getSiteByHost('ELVEBYEN.NO:443'))?.id).toBe(elvebyen!.id);
    expect((await getSiteByHost('www.elvebyen.no'))?.id).toBe(elvebyen!.id);
    expect((await getSiteByHost('fjellstad.no'))?.id).toBe(fjellstad!.id);
    expect((await getSiteByHost('www.fjellstad.no:3000'))?.id).toBe(fjellstad!.id);
    expect(await getSiteByHost('ukjent.no')).toBeNull();
    expect(await getSiteByHost(null)).toBeNull();
  });

  it('ignores inactive sites', async () => {
    await seedMinimal(db);
    await db
      .insert(sites)
      .values({ slug: 'gammel', name: 'Nedlagt', domains: ['gammel.no'], isActive: false });
    invalidateSiteCache();
    expect(await getSiteByHost('gammel.no')).toBeNull();
    expect((await listActiveSites()).map((s) => s.slug)).toEqual(['test']);
  });
});

describe('getDefaultSite / getSiteById', () => {
  it('returns the first active site by creation time', async () => {
    const seeded = await seedMinimal(db);
    await db.insert(sites).values({ slug: 'senere', name: 'Senere', domains: ['senere.no'] });
    invalidateSiteCache();
    expect((await getDefaultSite()).id).toBe(seeded.site.id);
  });

  it('throws when the installation has no active site', async () => {
    await expect(getDefaultSite()).rejects.toThrow(/Ingen aktiv nettavis/);
  });

  it('looks up by id, including inactive sites', async () => {
    const seeded = await seedMinimal(db);
    const [inactive] = await db
      .insert(sites)
      .values({ slug: 'inaktiv', name: 'Inaktiv', isActive: false })
      .returning();
    invalidateSiteCache();
    expect((await getSiteById(seeded.site.id))?.slug).toBe('test');
    expect((await getSiteById(inactive!.id))?.slug).toBe('inaktiv');
    expect(await getSiteById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('cache', () => {
  it('serves stale data until invalidated or expired (60 s)', async () => {
    const seeded = await seedMinimal(db);
    expect((await getSiteByHost('localhost'))?.id).toBe(seeded.site.id);

    await db
      .update(sites)
      .set({ domains: ['ny.no'] })
      .where(eq(sites.id, seeded.site.id));
    // Still cached: the old domain resolves and the new one does not.
    expect((await getSiteByHost('localhost'))?.id).toBe(seeded.site.id);
    expect(await getSiteByHost('ny.no')).toBeNull();

    invalidateSiteCache();
    expect(await getSiteByHost('localhost')).toBeNull();
    expect((await getSiteByHost('ny.no'))?.id).toBe(seeded.site.id);

    // Expiry: advance the clock past the TTL.
    await db
      .update(sites)
      .set({ domains: ['nyere.no'] })
      .where(eq(sites.id, seeded.site.id));
    expect(await getSiteByHost('nyere.no')).toBeNull();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    expect((await getSiteByHost('nyere.no'))?.id).toBe(seeded.site.id);
  });
});

describe('getPublicSite', () => {
  it('resolves from the Host header and falls back to the default site', async () => {
    const seeded = await seedMinimal(db);
    const [elvebyen] = await db
      .insert(sites)
      .values({
        slug: 'elvebyen',
        name: 'Elvebyen Tidende',
        domains: ['elvebyen.no'],
        settings: { editorial: { responsibleEditor: 'Marit Solheim' } } as never,
      })
      .returning();
    invalidateSiteCache();

    headerStore.host = 'www.elvebyen.no:3000';
    const a = await getPublicSite();
    expect(a.site.id).toBe(elvebyen!.id);
    expect(a.settings.editorial.responsibleEditor).toBe('Marit Solheim');
    expect(a.settings.paywall.enabled).toBe(false); // defaults filled in

    headerStore.host = 'helt-ukjent.no';
    const b = await getPublicSite();
    expect(b.site.id).toBe(seeded.site.id);
  });

  it('parses sparse settings into a complete object', async () => {
    const seeded = await seedMinimal(db);
    const settings = getSiteSettings(seeded.site);
    expect(settings.theme.primary).toMatch(/^#/);
    expect(settings.checklist.items.length).toBeGreaterThan(0);
  });
});
