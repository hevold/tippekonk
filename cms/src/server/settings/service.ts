/**
 * Site settings service: the one place that writes `sites.settings` and the
 * general columns of the `sites` row. Every write re-reads the current row
 * inside a transaction so two admins saving different sections at the same
 * time never overwrite each other, then audits a diff summary, drops the
 * in-memory site cache and revalidates the public site.
 */
import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/db';
import { sites, type Site } from '@/db/schema';
import { parseSiteSettings, type SiteSettings } from '@/lib/validation/site';
import { ActionError, ConflictError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';
import { invalidateSiteCache } from '@/server/sites';

import { describeChanges, mergeSettingsSection, settingsDiff } from './merge';
import {
  sectionPayloadSchema,
  siteGeneralSchema,
  type SettingsSection,
  type SiteGeneralOutput,
} from './schema';

export const SECTION_LABELS: Record<SettingsSection, string> = {
  general: 'Generelt',
  editorial: 'Redaksjonelt',
  theme: 'Utseende',
  checklist: 'Sjekkliste',
  paywall: 'Pluss',
  seo: 'SEO',
  analytics: 'Analyse',
};

export type SettingsUpdateResult = {
  settings: SiteSettings;
  changed: string[];
};

/** Merge a section payload into the site's settings (SPEC: one action for every settings page). */
export async function updateSiteSettings(
  ctx: AdminContext,
  section: Exclude<SettingsSection, 'general'>,
  input: unknown,
): Promise<SettingsUpdateResult> {
  assertCan(ctx, 'settings:manage');
  const payload = sectionPayloadSchema.parse(input ?? {});

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(sites).where(eq(sites.id, ctx.site.id)).limit(1);
    if (!row) throw new NotFoundError('Fant ikke nettstedet.');
    const before = parseSiteSettings(row.settings);
    const after = mergeSettingsSection(before, section, payload);
    const changes = settingsDiff(before, after);
    if (changes.length > 0) {
      await tx
        .update(sites)
        .set({ settings: after, updatedAt: new Date() })
        .where(eq(sites.id, ctx.site.id));
    }
    return { after, changes };
  });

  if (result.changes.length > 0) {
    const described = describeChanges(result.changes);
    await auditFromContext(ctx, {
      action: 'settings.update',
      entityType: 'site',
      entityId: ctx.site.id,
      summary: `Endret ${SECTION_LABELS[section].toLowerCase()}-innstillinger (${summariseKeys(described.changed)})`,
      data: { section, ...described },
    });
    invalidateSiteCache();
    revalidatePublic(ctx.site.id);
  }
  return { settings: result.after, changed: result.changes.map((c) => c.key) };
}

/** "theme.primary, theme.accent og 3 til" */
export function summariseKeys(keys: string[], max = 4): string {
  if (keys.length === 0) return 'ingen endringer';
  const shown = keys.slice(0, max).join(', ');
  const rest = keys.length - max;
  return rest > 0 ? `${shown} og ${rest} til` : shown;
}

export type GeneralUpdateResult = { site: Site; changed: string[] };

/** Update name, tagline, domains, locale, timezone and active flag of the current site. */
export async function updateSiteGeneral(ctx: AdminContext, input: unknown): Promise<GeneralUpdateResult> {
  assertCan(ctx, 'settings:manage');
  const data: SiteGeneralOutput = siteGeneralSchema.parse(input ?? {});

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(sites).where(eq(sites.id, ctx.site.id)).limit(1);
    if (!row) throw new NotFoundError('Fant ikke nettstedet.');

    await assertDomainsFree(data.domains, ctx.site.id);

    if (row.isActive && !data.isActive) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(eq(sites.isActive, true), ne(sites.id, ctx.site.id)));
      if ((count ?? 0) === 0) {
        throw new ConflictError('Kan ikke deaktivere det eneste aktive nettstedet.');
      }
    }

    const next = {
      name: data.name,
      tagline: data.tagline || null,
      domains: data.domains,
      locale: data.locale,
      timezone: data.timezone,
      isActive: data.isActive,
    };
    const changes = (Object.keys(next) as (keyof typeof next)[]).filter(
      (key) => JSON.stringify(row[key] ?? null) !== JSON.stringify(next[key] ?? null),
    );
    const patch: Partial<Site> = {};
    for (const key of changes) Object.assign(patch, { [key]: next[key] });

    if (changes.length === 0) return { site: row, changes: [] as string[], before: row };
    const [updated] = await tx
      .update(sites)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(sites.id, ctx.site.id))
      .returning();
    if (!updated) throw new NotFoundError('Fant ikke nettstedet.');
    return { site: updated, changes: changes as string[], before: row };
  });

  if (result.changes.length > 0) {
    const before = result.before;
    const values: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of result.changes) {
      values[key] = { before: before[key as keyof Site], after: result.site[key as keyof Site] };
    }
    await auditFromContext(ctx, {
      action: 'settings.update',
      entityType: 'site',
      entityId: ctx.site.id,
      summary: `Endret generelle innstillinger (${summariseKeys(result.changes)})`,
      data: { section: 'general', changed: result.changes, values },
    });
    invalidateSiteCache();
    revalidatePublic(ctx.site.id);
  }
  return { site: result.site, changed: result.changes };
}

/** Domains map hosts to sites, so one host can belong to exactly one site. */
export async function assertDomainsFree(domains: string[], exceptSiteId: string | null): Promise<void> {
  if (domains.length === 0) return;
  const others = await db
    .select({ id: sites.id, name: sites.name, domains: sites.domains })
    .from(sites)
    .where(exceptSiteId ? ne(sites.id, exceptSiteId) : undefined);
  for (const other of others) {
    const taken = other.domains.map((d) => d.toLowerCase());
    const clash = domains.find((d) => taken.includes(d));
    if (clash) {
      throw new ActionError(`Domenet «${clash}» brukes allerede av «${other.name}».`, 'validation', {
        domains: [`Domenet «${clash}» brukes allerede av «${other.name}»`],
      });
    }
  }
}
