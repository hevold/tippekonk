import { describe, expect, it } from 'vitest';

import { ADMIN_NAV } from '@/config/admin-nav';
import { ROLE_PERMISSIONS } from '@/lib/permissions';

import {
  activeNavKey,
  greetingKey,
  groupNavItems,
  isNavActive,
  readSidebarCollapsed,
  SIDEBAR_STORAGE_KEY,
  visibleNavItems,
  writeSidebarCollapsed,
} from './nav-helpers';

describe('visibleNavItems', () => {
  it('shows everything to admins', () => {
    expect(visibleNavItems(ROLE_PERMISSIONS.admin).map((i) => i.key)).toEqual(ADMIN_NAV.map((i) => i.key));
  });

  it('hides admin-only entries from journalists', () => {
    const keys = visibleNavItems(ROLE_PERMISSIONS.journalist).map((i) => i.key);
    expect(keys).toEqual(['dashboard', 'articles', 'plan', 'media', 'live']);
  });

  it('gives contributors the basics only', () => {
    expect(visibleNavItems(ROLE_PERMISSIONS.contributor).map((i) => i.key)).toEqual([
      'dashboard',
      'articles',
      'plan',
      'media',
    ]);
  });

  it('returns nothing without permissions', () => {
    expect(visibleNavItems([])).toEqual([]);
  });
});

describe('groupNavItems', () => {
  it('keeps group order and drops empty groups', () => {
    const groups = groupNavItems(visibleNavItems(ROLE_PERMISSIONS.editor));
    expect(groups.map((g) => g.group)).toEqual(['content', 'structure', 'admin']);
    expect(groups[2]!.items.map((i) => i.key)).toEqual(['audit']);
    expect(groupNavItems(visibleNavItems(ROLE_PERMISSIONS.viewer)).map((g) => g.group)).toEqual(['content']);
  });
});

describe('isNavActive / activeNavKey', () => {
  it('matches the dashboard exactly', () => {
    expect(isNavActive('/admin', '/admin')).toBe(true);
    expect(isNavActive('/admin/artikler', '/admin')).toBe(false);
  });

  it('matches sub-routes for other items', () => {
    expect(isNavActive('/admin/artikler/abc', '/admin/artikler')).toBe(true);
    expect(isNavActive('/admin/artikler-x', '/admin/artikler')).toBe(false);
    expect(isNavActive('/admin/innstillinger/tema/', '/admin/innstillinger')).toBe(true);
  });

  it('picks the most specific item', () => {
    expect(activeNavKey('/admin/artikler/ny', ADMIN_NAV)).toBe('articles');
    expect(activeNavKey('/admin', ADMIN_NAV)).toBe('dashboard');
    expect(activeNavKey('/admin/ukjent', ADMIN_NAV)).toBeNull();
  });
});

describe('sidebar storage', () => {
  it('reads and writes the collapsed flag and tolerates missing storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    expect(readSidebarCollapsed(storage)).toBe(false);
    writeSidebarCollapsed(storage, true);
    expect(store.get(SIDEBAR_STORAGE_KEY)).toBe('1');
    expect(readSidebarCollapsed(storage)).toBe(true);
    expect(readSidebarCollapsed(null)).toBe(false);
    expect(() => writeSidebarCollapsed(null, true)).not.toThrow();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSidebarCollapsed(throwing)).toBe(false);
    expect(() => writeSidebarCollapsed(throwing, false)).not.toThrow();
  });
});

describe('greetingKey', () => {
  it('maps hours to greetings', () => {
    expect(greetingKey(6)).toBe('dashboard.greeting.morning');
    expect(greetingKey(9)).toBe('dashboard.greeting.morning');
    expect(greetingKey(10)).toBe('dashboard.greeting.day');
    expect(greetingKey(17)).toBe('dashboard.greeting.day');
    expect(greetingKey(18)).toBe('dashboard.greeting.evening');
    expect(greetingKey(2)).toBe('dashboard.greeting.evening');
  });
});
