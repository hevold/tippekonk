/**
 * Settings: section merge/parse (pure), the update service (transaction,
 * audit diff, domain uniqueness) and the general-site update.
 */
import { desc, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { auditLog, sites } from '@/db/schema';
import { DEFAULT_CHECKLIST, parseSiteSettings } from '@/lib/validation/site';
import { ForbiddenError } from '@/server/actions';
import type { Permission } from '@/lib/permissions';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
}));

import { contrastLevel, contrastRatio, formatRatio, readableTextOn } from './contrast';
import { describeChanges, mergeSettingsSection, settingsDiff } from './merge';
import { domainSchema, normalizeDomain, siteGeneralSchema } from './schema';
import { assertDomainsFree, summariseKeys, updateSiteGeneral, updateSiteSettings } from './service';
import { testContext } from './test-helpers';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('mergeSettingsSection', () => {
  it('keeps other sections when one section is updated partially', () => {
    const current = parseSiteSettings({
      paywall: { enabled: true, label: 'Abo+' },
      theme: { primary: '#123456' },
    });
    const next = mergeSettingsSection(current, 'theme', { theme: { accent: '#ff0000' } });
    expect(next.theme.accent).toBe('#ff0000');
    expect(next.theme.primary).toBe('#123456');
    expect(next.paywall.enabled).toBe(true);
    expect(next.paywall.label).toBe('Abo+');
    expect(next.checklist.items).toEqual(DEFAULT_CHECKLIST);
  });

  it('rejects an invalid hex colour with a dotted field path', () => {
    const current = parseSiteSettings({});
    expect(() => mergeSettingsSection(current, 'theme', { theme: { primary: 'blue' } })).toThrowError();
    try {
      mergeSettingsSection(current, 'theme', { theme: { primary: '#12' } });
    } catch (err) {
      const issues = (err as { issues: { path: PropertyKey[] }[] }).issues;
      expect(issues[0]?.path).toEqual(['theme', 'primary']);
    }
  });

  it('refuses keys that belong to another section', () => {
    const current = parseSiteSettings({});
    expect(() => mergeSettingsSection(current, 'paywall', { theme: { primary: '#000000' } })).toThrowError(
      /hører ikke til/,
    );
  });

  it('removes optional values when null is sent', () => {
    const current = parseSiteSettings({ theme: { logoMediaId: '4b3d9a8e-1d6f-4d2f-9c5b-2b3f0d3f4e11' } });
    const next = mergeSettingsSection(current, 'theme', { theme: { logoMediaId: null } });
    expect(next.theme.logoMediaId).toBeUndefined();
  });
});

describe('settingsDiff / describeChanges', () => {
  it('lists dotted keys that changed, arrays as a whole', () => {
    const a = parseSiteSettings({});
    const b = parseSiteSettings({ theme: { primary: '#000000' }, checklist: { items: [] } });
    const diff = settingsDiff(a, b);
    expect(diff.map((c) => c.key)).toEqual(['checklist.items', 'theme.primary']);
    const described = describeChanges(diff);
    expect(described.changed).toEqual(['checklist.items', 'theme.primary']);
    expect(described.values['theme.primary']).toEqual({ before: '#0b3d91', after: '#000000' });
    expect(described.values['checklist.items']).toBeUndefined();
  });

  it('summarises keys with "og N til"', () => {
    expect(summariseKeys([])).toBe('ingen endringer');
    expect(summariseKeys(['a', 'b'])).toBe('a, b');
    expect(summariseKeys(['a', 'b', 'c', 'd', 'e', 'f'])).toBe('a, b, c, d og 2 til');
  });
});

describe('updateSiteSettings', () => {
  it('merges the section, audits a diff and keeps unrelated sections', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await updateSiteSettings(ctx, 'paywall', { paywall: { enabled: true, ctaTitle: 'Les videre' } });
    const result = await updateSiteSettings(ctx, 'theme', {
      theme: { primary: '#ff0000', contentWidth: 1000 },
    });
    expect(result.changed).toEqual(['theme.contentWidth', 'theme.primary']);

    const [row] = await db.select().from(sites).where(eq(sites.id, seed.site.id));
    const stored = parseSiteSettings(row?.settings);
    expect(stored.theme.primary).toBe('#ff0000');
    expect(stored.theme.contentWidth).toBe(1000);
    expect(stored.paywall.enabled).toBe(true);
    expect(stored.paywall.ctaTitle).toBe('Les videre');

    const [entry] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(entry?.action).toBe('settings.update');
    expect(entry?.entityId).toBe(seed.site.id);
    expect(entry?.summary).toContain('theme.primary');
    expect(entry?.data).toMatchObject({ section: 'theme', changed: ['theme.contentWidth', 'theme.primary'] });
  });

  it('does not audit when nothing changed', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const result = await updateSiteSettings(ctx, 'seo', { seo: { titleSuffix: '' } });
    expect(result.changed).toEqual([]);
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(0);
  });

  it('rejects invalid values and forbids non-admins', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await expect(updateSiteSettings(ctx, 'theme', { theme: { primary: 'red' } })).rejects.toThrowError();
    const journalist = testContext(seed.journalist, seed.site, 'journalist');
    await expect(updateSiteSettings(journalist, 'seo', { seo: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('updateSiteGeneral', () => {
  it('updates name, tagline, domains and locale and audits the changed columns', async () => {
    const ctx = testContext(seed.admin, seed.site);
    const result = await updateSiteGeneral(ctx, {
      name: 'Ny avis',
      tagline: '',
      domains: ['https://Ny-Avis.no/', 'ny-avis.no', 'www.ny-avis.no:3000'],
      locale: 'nn',
      timezone: 'Europe/Oslo',
      isActive: true,
    });
    expect(result.site.name).toBe('Ny avis');
    expect(result.site.tagline).toBeNull();
    expect(result.site.domains).toEqual(['ny-avis.no', 'www.ny-avis.no']);
    expect(result.site.locale).toBe('nn');
    expect(result.changed.sort()).toEqual(['domains', 'locale', 'name', 'tagline']);
  });

  it('refuses to deactivate the only active site', async () => {
    const ctx = testContext(seed.admin, seed.site);
    await expect(
      updateSiteGeneral(ctx, {
        name: seed.site.name,
        tagline: '',
        domains: [],
        locale: 'nb',
        timezone: 'Europe/Oslo',
        isActive: false,
      }),
    ).rejects.toThrowError(/eneste aktive/);
  });

  it('refuses a domain that another site already uses', async () => {
    await db.insert(sites).values({ slug: 'other', name: 'Other', domains: ['other.no'] });
    await expect(assertDomainsFree(['other.no'], seed.site.id)).rejects.toThrowError(/brukes allerede/);
    await expect(assertDomainsFree(['other.no'], null)).rejects.toThrowError();
    await expect(assertDomainsFree(['free.no'], seed.site.id)).resolves.toBeUndefined();
  });
});

describe('domain and general schemas', () => {
  it('normalises pasted URLs to hostnames', () => {
    expect(normalizeDomain(' HTTPS://www.Avisa.no:8080/path?x=1 ')).toBe('www.avisa.no');
    expect(domainSchema.parse('localhost:3000')).toBe('localhost');
    expect(domainSchema.parse('127.0.0.1')).toBe('127.0.0.1');
    expect(() => domainSchema.parse('not a host')).toThrowError();
    expect(() => domainSchema.parse('')).toThrowError();
  });
  it('validates the timezone', () => {
    const base = { name: 'A', tagline: '', domains: [], locale: 'nb', isActive: true };
    expect(siteGeneralSchema.safeParse({ ...base, timezone: 'Europe/Oslo' }).success).toBe(true);
    expect(siteGeneralSchema.safeParse({ ...base, timezone: 'Mars/Olympus' }).success).toBe(false);
  });
});

describe('contrast', () => {
  it('computes WCAG ratios and levels', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#fff', '#fff')).toBe(1);
    expect(contrastRatio('zzz', '#fff')).toBeNull();
    expect(contrastLevel(21)).toBe('AAA');
    expect(contrastLevel(4.6)).toBe('AA');
    expect(contrastLevel(3.2)).toBe('AA-large');
    expect(contrastLevel(1.5)).toBe('fail');
    expect(formatRatio(4.567)).toBe('4,57:1');
    expect(formatRatio(21)).toBe('21,0:1');
    expect(readableTextOn('#0b3d91')).toBe('#ffffff');
    expect(readableTextOn('#ffff00')).toBe('#000000');
  });
});
