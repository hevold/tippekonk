'use server';
/**
 * Media server actions: what the admin UI and the picker call. Every
 * mutation follows the SPEC order — permission check → validate →
 * mutate → audit → cache revalidation — and returns an ActionResult so the
 * client can toast the Norwegian message or map field errors.
 *
 * Reads (listMediaAction, getMediaUsageAction, listFoldersAction) only need
 * admin access, so contributors can pick images for their own articles.
 * Uploads go through /api/upload (multipart), not through an action.
 */
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { media, type Media } from '@/db/schema';
import { mediaFilterSchema, mediaUpdateSchema } from '@/lib/validation/media';
import { uuidSchema } from '@/lib/validation/common';
import { NotFoundError, runAction, type ActionResult } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
// INTEGRATION: provided by the auth area (SPEC 4.2).
import { requirePermission } from '@/server/auth/guards';
import { revalidatePublic } from '@/server/cache';

import { deleteMediaFiles, regenerateVariants } from './processing';
import {
  listFolders,
  listMedia,
  mediaUsage,
  mediaUsageCounts,
  type MediaFolder,
  type MediaPage,
  type MediaUsage,
} from './queries';

const idsSchema = z.array(uuidSchema).min(1, 'Velg minst én fil').max(500, 'Maks 500 filer om gangen');

const focalSchema = z.object({
  id: uuidSchema,
  focalX: z.coerce.number().min(0).max(1),
  focalY: z.coerce.number().min(0).max(1),
});

/* -------------------------------------------------------------------------- */
/*  Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Paged library listing for the picker and the admin grid. */
export async function listMediaAction(input: unknown): Promise<ActionResult<MediaPage>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const filter = mediaFilterSchema.parse(input ?? {});
    return listMedia(ctx.site.id, {
      q: filter.q,
      kind: filter.kind,
      folder: filter.folder || undefined,
      page: filter.page,
      perPage: filter.perPage,
      trashed: filter.trashed,
    });
  });
}

export async function listFoldersAction(): Promise<ActionResult<MediaFolder[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    return listFolders(ctx.site.id);
  });
}

export async function getMediaUsageAction(input: unknown): Promise<ActionResult<MediaUsage[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const id = uuidSchema.parse(input);
    return mediaUsage(ctx.site.id, id);
  });
}

/** Usage counts keyed by media id, for the "used in N articles" warning before bulk deletes. */
export async function getMediaUsageCountsAction(
  input: unknown,
): Promise<ActionResult<Record<string, number>>> {
  return runAction(async () => {
    const ctx = await requirePermission('admin:access');
    const ids = idsSchema.parse(input);
    const counts = await mediaUsageCounts(ctx.site.id, ids);
    return Object.fromEntries(counts);
  });
}

/* -------------------------------------------------------------------------- */
/*  Mutations                                                                  */
/* -------------------------------------------------------------------------- */

/** Update alt/caption/credit/license/source/folder/tags/takenAt and focal point (partial). */
export async function updateMediaMeta(input: unknown): Promise<ActionResult<Media>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:edit');
    const { id, ...parsed } = mediaUpdateSchema.parse(input);
    // Zod 4 keeps firing `.default()` for absent keys even after `.partial()`, so only
    // the fields the caller actually sent are written — the picker's inline alt/credit
    // edit must not reset the folder, tags or focal point.
    const provided = new Set(Object.keys(input as Record<string, unknown>));
    const patch = Object.fromEntries(Object.entries(parsed).filter(([key]) => provided.has(key)));
    const [existing] = await db
      .select({ id: media.id, filename: media.filename })
      .from(media)
      .where(and(eq(media.id, id), eq(media.siteId, ctx.site.id)))
      .limit(1);
    if (!existing) throw new NotFoundError('Fant ikke mediefilen.');

    const [updated] = await db
      .update(media)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(media.id, id), eq(media.siteId, ctx.site.id)))
      .returning();
    if (!updated) throw new NotFoundError('Fant ikke mediefilen.');

    await auditFromContext(ctx, {
      action: 'media.update',
      entityType: 'media',
      entityId: id,
      summary: `Oppdaterte metadata for «${existing.filename}»`,
      data: { fields: Object.keys(patch) },
    });
    revalidatePublic(ctx.site.id);
    return updated;
  });
}

export async function setFocalPoint(input: unknown): Promise<ActionResult<Media>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:edit');
    const { id, focalX, focalY } = focalSchema.parse(input);
    const [updated] = await db
      .update(media)
      .set({ focalX, focalY, updatedAt: new Date() })
      .where(and(eq(media.id, id), eq(media.siteId, ctx.site.id)))
      .returning();
    if (!updated) throw new NotFoundError('Fant ikke mediefilen.');
    await auditFromContext(ctx, {
      action: 'media.focal_point',
      entityType: 'media',
      entityId: id,
      summary: `Satte fokuspunkt for «${updated.filename}»`,
      data: { focalX, focalY },
    });
    revalidatePublic(ctx.site.id);
    return updated;
  });
}

/** Move files to the trash (soft delete). Returns the number of affected rows. */
export async function trashMedia(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:delete');
    const ids = idsSchema.parse(Array.isArray(input) ? input : [input]);
    const rows = await db
      .update(media)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(media.siteId, ctx.site.id), inArray(media.id, ids), isNull(media.deletedAt)))
      .returning({ id: media.id, filename: media.filename });
    for (const row of rows) {
      await auditFromContext(ctx, {
        action: 'media.trash',
        entityType: 'media',
        entityId: row.id,
        summary: `La «${row.filename}» i papirkurven`,
      });
    }
    revalidatePublic(ctx.site.id);
    return { count: rows.length };
  });
}

export async function restoreMedia(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:delete');
    const ids = idsSchema.parse(Array.isArray(input) ? input : [input]);
    const rows = await db
      .update(media)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(media.siteId, ctx.site.id), inArray(media.id, ids), isNotNull(media.deletedAt)))
      .returning({ id: media.id, filename: media.filename });
    for (const row of rows) {
      await auditFromContext(ctx, {
        action: 'media.restore',
        entityType: 'media',
        entityId: row.id,
        summary: `Gjenopprettet «${row.filename}» fra papirkurven`,
      });
    }
    revalidatePublic(ctx.site.id);
    return { count: rows.length };
  });
}

/**
 * Permanently delete files and rows. Only trashed items can be destroyed,
 * so a stray click can never remove a file the site still shows. Article
 * references are cleared by the database (featured_media_id ON DELETE SET
 * NULL); body image nodes render nothing for a missing id.
 */
export async function destroyMedia(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:delete');
    const ids = idsSchema.parse(Array.isArray(input) ? input : [input]);
    const rows = await db
      .select()
      .from(media)
      .where(and(eq(media.siteId, ctx.site.id), inArray(media.id, ids), isNotNull(media.deletedAt)));

    let count = 0;
    for (const row of rows) {
      // Delete the row first so a half-failed file removal cannot leave a row pointing at missing files.
      await db.delete(media).where(eq(media.id, row.id));
      count += 1;
      try {
        await deleteMediaFiles(row);
      } catch (err) {
        console.error('[media] could not delete files for', row.storageKey, err);
      }
      await auditFromContext(ctx, {
        action: 'media.destroy',
        entityType: 'media',
        entityId: row.id,
        summary: `Slettet «${row.filename}» permanent`,
        data: { storageKey: row.storageKey, size: row.size },
      });
    }
    revalidatePublic(ctx.site.id);
    return { count };
  });
}

/** Re-render WebP variants from the stored original. */
export async function regenerateVariantsAction(input: unknown): Promise<ActionResult<Media>> {
  return runAction(async () => {
    const ctx = await requirePermission('media:edit');
    const id = uuidSchema.parse(input);
    const [row] = await db
      .select({ id: media.id })
      .from(media)
      .where(and(eq(media.id, id), eq(media.siteId, ctx.site.id)))
      .limit(1);
    if (!row) throw new NotFoundError('Fant ikke mediefilen.');
    const updated = await regenerateVariants(id);
    await auditFromContext(ctx, {
      action: 'media.regenerate',
      entityType: 'media',
      entityId: id,
      summary: `Genererte bildevarianter på nytt for «${updated.filename}»`,
    });
    revalidatePublic(ctx.site.id);
    return updated;
  });
}
