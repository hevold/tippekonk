/**
 * Multi-site management for superadmins (settings → Nettsteder): list all
 * sites with a few counts, create a site with sensible defaults (content
 * types, a "Nyheter" section, menus, a front layout and the creator as
 * admin member), edit the general columns, deactivate and delete.
 *
 * The 'use server' wrappers live in src/server/sites/admin-actions.ts.
 */
import 'server-only';

import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { articles, contentTypes, layouts, memberships, menus, sections, sites, type Site } from '@/db/schema';
import { isReservedSlug } from '@/config/routes';
import { defaultFrontLayout } from '@/lib/layout/engine';
import { slugSchema, uuidSchema } from '@/lib/validation/common';
import type { MenuItem } from '@/lib/validation/site';
import { ActionError, ConflictError, NotFoundError } from '@/server/actions';
import { audit } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';
import { invalidateSiteCache } from '@/server/sites';

import { domainSchema, SITE_LOCALES, siteGeneralSchema } from './schema';
import { assertDomainsFree, summariseKeys } from './service';

export const siteCreateSchema = z.object({
  name: z.string().trim().min(1, 'Navn må fylles ut').max(120, 'Maks 120 tegn'),
  slug: slugSchema.refine((v) => !isReservedSlug(v), 'Denne adressen er reservert'),
  tagline: z.string().trim().max(200, 'Maks 200 tegn').default(''),
  domains: z
    .array(domainSchema)
    .max(20, 'Maks 20 domener')
    .default([])
    .transform((list) => [...new Set(list)]),
  locale: z.enum(SITE_LOCALES, { error: 'Velg språk' }).default('nb'),
});
export type SiteCreateInput = z.input<typeof siteCreateSchema>;

export const siteUpdateSchema = siteGeneralSchema;

export const siteDeleteSchema = z.object({
  id: uuidSchema,
  /** The user must type the slug to confirm. */
  confirmSlug: z.string().trim().min(1, 'Skriv inn adressen (slug) for å bekrefte'),
});

export type SiteSummary = Site & { members: number; articles: number };

/** Every site (active and inactive) with member and article counts, oldest first. */
export async function listSitesForAdmin(): Promise<SiteSummary[]> {
  const rows = await db.select().from(sites).orderBy(asc(sites.createdAt));
  if (rows.length === 0) return [];
  const [memberCounts, articleCounts] = await Promise.all([
    db.select({ siteId: memberships.siteId, n: count() }).from(memberships).groupBy(memberships.siteId),
    db
      .select({ siteId: articles.siteId, n: count() })
      .from(articles)
      .where(isNull(articles.deletedAt))
      .groupBy(articles.siteId),
  ]);
  const members = new Map(memberCounts.map((r) => [r.siteId, r.n]));
  const articleN = new Map(articleCounts.map((r) => [r.siteId, r.n]));
  return rows.map((s) => ({ ...s, members: members.get(s.id) ?? 0, articles: articleN.get(s.id) ?? 0 }));
}

/** The default content types every new site starts with. */
export function defaultContentTypes(siteId: string) {
  return [
    {
      siteId,
      key: 'article',
      name: 'Artikkel',
      description: 'Vanlig nyhetssak',
      icon: 'FileText',
      template: 'article',
      isDefault: true,
      sortOrder: 0,
      fields: [],
    },
    {
      siteId,
      key: 'opinion',
      name: 'Kommentar/Leder',
      description: 'Meningsstoff: leder, kommentar og debattinnlegg',
      icon: 'MessageSquareQuote',
      template: 'opinion',
      isDefault: false,
      sortOrder: 1,
      fields: [
        {
          key: 'standpoint',
          label: 'Standpunkt',
          type: 'select' as const,
          required: false,
          showInList: false,
          options: [
            { value: 'leder', label: 'Leder' },
            { value: 'kommentar', label: 'Kommentar' },
            { value: 'debatt', label: 'Debattinnlegg' },
          ],
        },
      ],
    },
    {
      siteId,
      key: 'notice',
      name: 'Notis',
      description: 'Kort melding uten bilde',
      icon: 'StickyNote',
      template: 'notice',
      isDefault: false,
      sortOrder: 2,
      fields: [],
    },
  ];
}

/**
 * Create a site with defaults. Superadmin only. Everything happens in one
 * transaction so a failure leaves no half-configured site behind.
 */
export async function createSite(ctx: AdminContext, input: unknown): Promise<Site> {
  assertCan(ctx, 'site:manage');
  const data = siteCreateSchema.parse(input ?? {});

  const site = await db.transaction(async (tx) => {
    const [slugTaken] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.slug, data.slug))
      .limit(1);
    if (slugTaken) {
      throw new ActionError(`Adressen «${data.slug}» er allerede i bruk.`, 'validation', {
        slug: [`Adressen «${data.slug}» er allerede i bruk`],
      });
    }
    await assertDomainsFree(data.domains, null);

    const [created] = await tx
      .insert(sites)
      .values({
        slug: data.slug,
        name: data.name,
        tagline: data.tagline || null,
        domains: data.domains,
        locale: data.locale,
        timezone: 'Europe/Oslo',
        settings: {} as Site['settings'],
        isActive: true,
      })
      .returning();
    if (!created) throw new ConflictError('Kunne ikke opprette nettstedet.');

    await tx.insert(contentTypes).values(defaultContentTypes(created.id));

    const [nyheter] = await tx
      .insert(sections)
      .values({ siteId: created.id, name: 'Nyheter', slug: 'nyheter', sortOrder: 0, showInMenu: true })
      .returning();
    const sectionRows = nyheter ? [nyheter] : [];

    const primary: MenuItem[] = sectionRows.map((s) => ({ id: s.slug, label: s.name, href: `/${s.slug}` }));
    await tx.insert(menus).values([
      { siteId: created.id, key: 'primary', items: primary },
      { siteId: created.id, key: 'footer', items: [] },
      { siteId: created.id, key: 'topbar', items: [] },
    ]);

    await tx.insert(layouts).values({
      siteId: created.id,
      key: 'front',
      name: 'Forsiden',
      draft: defaultFrontLayout(sectionRows),
      published: null,
      updatedBy: ctx.user.id,
    });

    await tx
      .insert(memberships)
      .values({ userId: ctx.user.id, siteId: created.id, role: 'admin' })
      .onConflictDoNothing();

    return created;
  });

  await audit(
    { user: ctx.user, site, ip: ctx.ip },
    {
      action: 'site.create',
      entityType: 'site',
      entityId: site.id,
      summary: `Opprettet nettstedet «${site.name}» (${site.slug})`,
      data: { slug: site.slug, domains: site.domains, locale: site.locale },
    },
  );
  invalidateSiteCache();
  return site;
}

/** Update the general columns of any site (superadmin). Same rules as the Generelt page. */
export async function updateSite(ctx: AdminContext, id: unknown, input: unknown): Promise<Site> {
  assertCan(ctx, 'site:manage');
  const siteId = uuidSchema.parse(id);
  const data = siteUpdateSchema.parse(input ?? {});

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!row) throw new NotFoundError('Fant ikke nettstedet.');
    await assertDomainsFree(data.domains, siteId);
    if (row.isActive && !data.isActive) await assertNotLastActive(siteId);

    const next = {
      name: data.name,
      tagline: data.tagline || null,
      domains: data.domains,
      locale: data.locale,
      timezone: data.timezone,
      isActive: data.isActive,
    };
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
      (key) => JSON.stringify(row[key] ?? null) !== JSON.stringify(next[key] ?? null),
    );
    if (changed.length === 0) return { site: row, changed: [] as string[] };
    const [updated] = await tx
      .update(sites)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(sites.id, siteId))
      .returning();
    if (!updated) throw new NotFoundError('Fant ikke nettstedet.');
    return { site: updated, changed: changed as string[] };
  });

  if (result.changed.length > 0) {
    await audit(
      { user: ctx.user, site: result.site, ip: ctx.ip },
      {
        action: 'site.update',
        entityType: 'site',
        entityId: result.site.id,
        summary: `Endret nettstedet «${result.site.name}» (${summariseKeys(result.changed)})`,
        data: { changed: result.changed },
      },
    );
    invalidateSiteCache();
    revalidatePublic(result.site.id);
  }
  return result.site;
}

async function assertNotLastActive(siteId: string): Promise<void> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sites)
    .where(and(eq(sites.isActive, true), ne(sites.id, siteId)));
  if ((n ?? 0) === 0) throw new ConflictError('Kan ikke deaktivere det eneste aktive nettstedet.');
}

/** Toggle isActive (superadmin). Deactivating the last active site is refused. */
export async function setSiteActive(ctx: AdminContext, id: unknown, active: boolean): Promise<Site> {
  assertCan(ctx, 'site:manage');
  const siteId = uuidSchema.parse(id);
  const [row] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!row) throw new NotFoundError('Fant ikke nettstedet.');
  if (row.isActive === active) return row;
  if (!active) await assertNotLastActive(siteId);
  const [updated] = await db
    .update(sites)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(sites.id, siteId))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke nettstedet.');
  await audit(
    { user: ctx.user, site: updated, ip: ctx.ip },
    {
      action: active ? 'site.activate' : 'site.deactivate',
      entityType: 'site',
      entityId: updated.id,
      summary: `${active ? 'Aktiverte' : 'Deaktiverte'} nettstedet «${updated.name}»`,
    },
  );
  invalidateSiteCache();
  revalidatePublic(updated.id);
  return updated;
}

/**
 * Delete a site and everything in it (cascade). The caller must type the
 * slug; the last remaining site can never be deleted. Uploaded files stay on
 * disk/S3 (the media rows are gone, so nothing references them).
 */
export async function deleteSite(ctx: AdminContext, input: unknown): Promise<{ id: string; slug: string }> {
  assertCan(ctx, 'site:manage');
  const data = siteDeleteSchema.parse(input ?? {});
  const [row] = await db.select().from(sites).where(eq(sites.id, data.id)).limit(1);
  if (!row) throw new NotFoundError('Fant ikke nettstedet.');
  if (data.confirmSlug.toLowerCase() !== row.slug) {
    throw new ActionError('Adressen stemmer ikke.', 'validation', {
      confirmSlug: [`Skriv «${row.slug}» for å bekrefte slettingen`],
    });
  }
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sites)
    .where(ne(sites.id, data.id));
  if ((n ?? 0) === 0) throw new ConflictError('Kan ikke slette det eneste nettstedet.');

  await db.delete(sites).where(eq(sites.id, data.id));
  // The site row is gone, so this entry is installation-wide (no siteId).
  await audit(
    { user: ctx.user, site: null, ip: ctx.ip },
    {
      action: 'site.delete',
      entityType: 'site',
      entityId: row.id,
      summary: `Slettet nettstedet «${row.name}» (${row.slug})`,
      data: { slug: row.slug, name: row.name, domains: row.domains },
    },
  );
  invalidateSiteCache();
  revalidatePublic(row.id);
  return { id: row.id, slug: row.slug };
}
