import { describe, expect, it, vi } from 'vitest';

import type { Site } from '@/db/schema';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { clientIpFromHeaders, resolveActiveSite } = await import('./context');
const { isAuthPublicPath, safeNextPath, sessionCookieOptions } = await import('./cookies');

function site(overrides: Partial<Site> & Pick<Site, 'id' | 'name'>): Site {
  return {
    slug: overrides.name.toLowerCase(),
    tagline: null,
    domains: [],
    locale: 'nb',
    timezone: 'Europe/Oslo',
    settings: {} as Site['settings'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const avisa = site({ id: 'a', name: 'Avisa' });
const bladet = site({ id: 'b', name: 'Bladet' });
const nedlagt = site({ id: 'c', name: 'Nedlagt', isActive: false });

describe('resolveActiveSite', () => {
  it('returns null without memberships', () => {
    expect(resolveActiveSite({ isSuperadmin: false, memberships: [], allSites: [avisa, bladet] })).toBeNull();
  });

  it('picks the first membership by name with the membership role', () => {
    const r = resolveActiveSite({
      isSuperadmin: false,
      memberships: [
        { siteId: 'b', role: 'editor' },
        { siteId: 'a', role: 'journalist' },
      ],
      allSites: [bladet, avisa, nedlagt],
    });
    expect(r?.site.id).toBe('a');
    expect(r?.role).toBe('journalist');
    expect(r?.sites.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('honours the cookie when it names a site the user may use', () => {
    const memberships = [
      { siteId: 'a', role: 'journalist' as const },
      { siteId: 'b', role: 'editor' as const },
    ];
    expect(
      resolveActiveSite({ isSuperadmin: false, memberships, allSites: [avisa, bladet], preferredSiteId: 'b' })
        ?.role,
    ).toBe('editor');
    expect(
      resolveActiveSite({
        isSuperadmin: false,
        memberships,
        allSites: [avisa, bladet],
        preferredSiteId: 'zzz',
      })?.site.id,
    ).toBe('a');
    // Inactive sites are never selectable.
    expect(
      resolveActiveSite({
        isSuperadmin: false,
        memberships: [{ siteId: 'c', role: 'admin' }],
        allSites: [nedlagt],
      }),
    ).toBeNull();
  });

  it('gives superadmins every active site as admin', () => {
    const r = resolveActiveSite({
      isSuperadmin: true,
      memberships: [],
      allSites: [bladet, avisa, nedlagt],
      preferredSiteId: 'b',
    });
    expect(r?.site.id).toBe('b');
    expect(r?.role).toBe('admin');
    expect(r?.sites).toHaveLength(2);
  });
});

describe('request helpers', () => {
  it('reads the client ip only when the proxy is trusted', () => {
    const get = (name: string) => (name === 'x-forwarded-for' ? '203.0.113.9, 10.0.0.1' : null);
    expect(clientIpFromHeaders(get, false)).toBeNull();
    expect(clientIpFromHeaders(get, true)).toBe('203.0.113.9');
    expect(clientIpFromHeaders(() => null, true)).toBeNull();
  });

  it('only allows local return paths', () => {
    expect(safeNextPath('/admin/artikler/1')).toBe('/admin/artikler/1');
    expect(safeNextPath('https://evil.example')).toBe('/admin');
    expect(safeNextPath('//evil.example')).toBe('/admin');
    expect(safeNextPath('/admin/login')).toBe('/admin');
    expect(safeNextPath(null)).toBe('/admin');
  });

  it('knows which admin paths are public and sets secure cookies for https', () => {
    expect(isAuthPublicPath('/admin/login')).toBe(true);
    expect(isAuthPublicPath('/admin/invitasjon/abc')).toBe(true);
    expect(isAuthPublicPath('/admin/artikler')).toBe(false);
    expect(sessionCookieOptions('https://avisa.no').secure).toBe(true);
    expect(sessionCookieOptions('http://localhost:3000').secure).toBe(false);
    expect(sessionCookieOptions('http://localhost:3000').maxAge).toBe(30 * 24 * 3600);
  });
});
