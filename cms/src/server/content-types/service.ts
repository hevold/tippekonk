/**
 * Content type mutations. Rules enforced here:
 *  - `key` is unique per site and immutable after creation
 *  - exactly one type per site is the default: making one default clears the
 *    others; the only default cannot be un-defaulted or deactivated
 *  - a type with articles cannot be deleted (change their type first)
 *  - field definitions are validated with contentTypeInputSchema (unique
 *    keys, options for select fields)
 */
import 'server-only';

import { and, eq, isNull, ne, sql } from 'drizzle-orm';

import { db, type Tx } from '@/db';
import { articles, contentTypes, type ContentType } from '@/db/schema';
import { contentTypeInputSchema, type ContentTypeInput } from '@/lib/validation/taxonomy';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

type Writer = Tx | typeof db;

async function loadType(tx: Writer, siteId: string, id: string): Promise<ContentType> {
  const [row] = await tx
    .select()
    .from(contentTypes)
    .where(and(eq(contentTypes.siteId, siteId), eq(contentTypes.id, id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke innholdstypen.');
  return row;
}

async function keyTaken(tx: Writer, siteId: string, key: string, excludeId?: string): Promise<boolean> {
  const where = excludeId
    ? and(eq(contentTypes.siteId, siteId), eq(contentTypes.key, key), ne(contentTypes.id, excludeId))
    : and(eq(contentTypes.siteId, siteId), eq(contentTypes.key, key));
  const [row] = await tx.select({ id: contentTypes.id }).from(contentTypes).where(where).limit(1);
  return Boolean(row);
}

async function otherDefaultExists(tx: Writer, siteId: string, excludeId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(
      and(eq(contentTypes.siteId, siteId), eq(contentTypes.isDefault, true), ne(contentTypes.id, excludeId)),
    )
    .limit(1);
  return Boolean(row);
}

async function anyDefaultExists(tx: Writer, siteId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: contentTypes.id })
    .from(contentTypes)
    .where(and(eq(contentTypes.siteId, siteId), eq(contentTypes.isDefault, true)))
    .limit(1);
  return Boolean(row);
}

async function clearOtherDefaults(tx: Writer, siteId: string, keepId: string): Promise<void> {
  await tx
    .update(contentTypes)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(contentTypes.siteId, siteId), ne(contentTypes.id, keepId)));
}

function values(data: ContentTypeInput) {
  return {
    name: data.name,
    description: data.description,
    icon: data.icon,
    template: data.template,
    fields: data.fields,
    isActive: data.isActive,
    sortOrder: data.sortOrder,
  };
}

export async function createContentType(ctx: AdminContext, input: unknown): Promise<ContentType> {
  assertCan(ctx, 'content_type:manage');
  const data = contentTypeInputSchema.parse(input);
  const created = await db.transaction(async (tx) => {
    if (await keyTaken(tx, ctx.site.id, data.key)) {
      throw new ActionError('Nøkkelen er allerede i bruk.', 'validation', {
        key: ['Nøkkelen er allerede i bruk'],
      });
    }
    // The first type of a site is always the default.
    const isDefault = data.isDefault || !(await anyDefaultExists(tx, ctx.site.id));
    if (isDefault && !data.isActive) {
      throw new ActionError('Standardtypen må være aktiv.', 'validation', {
        isActive: ['Standardtypen må være aktiv'],
      });
    }
    const [maxRow] = await tx
      .select({ max: sql<number>`coalesce(max(${contentTypes.sortOrder}), -1)`.mapWith(Number) })
      .from(contentTypes)
      .where(eq(contentTypes.siteId, ctx.site.id));
    const sortOrder =
      input && typeof input === 'object' && 'sortOrder' in input ? data.sortOrder : (maxRow?.max ?? -1) + 1;
    const [row] = await tx
      .insert(contentTypes)
      .values({ siteId: ctx.site.id, key: data.key, ...values(data), sortOrder, isDefault })
      .returning();
    if (!row) throw new Error('Kunne ikke opprette innholdstypen.');
    if (isDefault) await clearOtherDefaults(tx, ctx.site.id, row.id);
    return row;
  });
  await auditFromContext(ctx, {
    action: 'content_type.create',
    entityType: 'content_type',
    entityId: created.id,
    summary: `Opprettet innholdstypen «${created.name}» (${created.key})`,
    data: { fields: created.fields.map((f) => f.key) },
  });
  revalidatePublic(ctx.site.id);
  return created;
}

export async function updateContentType(ctx: AdminContext, id: string, input: unknown): Promise<ContentType> {
  assertCan(ctx, 'content_type:manage');
  const existing = await loadType(db, ctx.site.id, id);
  // The key is immutable; the form sends it back read-only, so validate against the stored one.
  const data = contentTypeInputSchema.parse({ ...(input as object), key: existing.key });
  const updated = await db.transaction(async (tx) => {
    const others = await otherDefaultExists(tx, ctx.site.id, id);
    const isDefault = data.isDefault || !others;
    if (existing.isDefault && !data.isDefault && !others) {
      throw new ActionError('Velg en annen standardtype først.', 'validation', {
        isDefault: ['Minst én type må være standard'],
      });
    }
    if (isDefault && !data.isActive) {
      throw new ActionError('Standardtypen må være aktiv. Velg en annen standardtype først.', 'validation', {
        isActive: ['Standardtypen må være aktiv'],
      });
    }
    const [row] = await tx
      .update(contentTypes)
      .set({ ...values(data), isDefault, updatedAt: new Date() })
      .where(eq(contentTypes.id, id))
      .returning();
    if (!row) throw new NotFoundError('Fant ikke innholdstypen.');
    if (isDefault) await clearOtherDefaults(tx, ctx.site.id, id);
    return row;
  });
  const removedFields = existing.fields
    .map((f) => f.key)
    .filter((k) => !updated.fields.some((f) => f.key === k));
  await auditFromContext(ctx, {
    action: 'content_type.update',
    entityType: 'content_type',
    entityId: id,
    summary: `Oppdaterte innholdstypen «${updated.name}»`,
    data: { fields: updated.fields.map((f) => f.key), removedFields },
  });
  revalidatePublic(ctx.site.id);
  return updated;
}

/** Make `id` the site's default type (and clear the others). */
export async function setDefaultContentType(ctx: AdminContext, id: string): Promise<ContentType> {
  assertCan(ctx, 'content_type:manage');
  const updated = await db.transaction(async (tx) => {
    const existing = await loadType(tx, ctx.site.id, id);
    if (!existing.isActive)
      throw new ActionError('Aktiver innholdstypen før du gjør den til standard.', 'validation');
    const [row] = await tx
      .update(contentTypes)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(contentTypes.id, id))
      .returning();
    if (!row) throw new NotFoundError('Fant ikke innholdstypen.');
    await clearOtherDefaults(tx, ctx.site.id, id);
    return row;
  });
  await auditFromContext(ctx, {
    action: 'content_type.update',
    entityType: 'content_type',
    entityId: id,
    summary: `Gjorde «${updated.name}» til standard innholdstype`,
  });
  revalidatePublic(ctx.site.id);
  return updated;
}

/** Delete a type without articles. The default type cannot be deleted. */
export async function deleteContentType(ctx: AdminContext, id: string): Promise<void> {
  assertCan(ctx, 'content_type:manage');
  const name = await db.transaction(async (tx) => {
    const existing = await loadType(tx, ctx.site.id, id);
    if (existing.isDefault)
      throw new ActionError('Standardtypen kan ikke slettes. Velg en annen standardtype først.', 'conflict');
    const [countRow] = await tx
      .select({ value: sql<number>`count(*)`.mapWith(Number) })
      .from(articles)
      .where(and(eq(articles.contentTypeId, id), isNull(articles.deletedAt)));
    const used = countRow?.value ?? 0;
    if (used > 0) {
      throw new ActionError(
        `${used} saker bruker denne innholdstypen. Endre innholdstype på sakene (i redigeringsvisningen) før du sletter.`,
        'conflict',
      );
    }
    // Articles in the trash still reference the type (FK restrict) — remove them for good first.
    await tx.delete(articles).where(eq(articles.contentTypeId, id));
    await tx.delete(contentTypes).where(eq(contentTypes.id, id));
    return existing.name;
  });
  await auditFromContext(ctx, {
    action: 'content_type.delete',
    entityType: 'content_type',
    entityId: id,
    summary: `Slettet innholdstypen «${name}»`,
  });
  revalidatePublic(ctx.site.id);
}
