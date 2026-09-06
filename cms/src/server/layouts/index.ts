/**
 * Layout persistence (front page and section pages). A layout row holds a
 * `draft` (edited in /admin/forside) and a `published` document (what the
 * public site renders through the public area's `getFrontLayout`).
 *
 *   const layout = await getLayout(siteId, 'front');       // created on demand
 *   await saveDraft(ctx, 'front', doc);                     // validate + audit
 *   await publishLayout(ctx, 'front');                      // published = draft, revalidate, webhook
 *   await discardDraft(ctx, 'front');                       // draft = published (or default)
 *   const items = await listLayouts(siteId);                // front + one entry per section
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { layouts, sections, type Layout, type Section } from '@/db/schema';
import {
  defaultFrontLayout,
  layoutDocSchema,
  layoutPinnedIds,
  newBlock,
  newRow,
  parseLayoutDoc,
} from '@/lib/layout/engine';
import type { LayoutDoc } from '@/lib/layout/types';
import { layoutKeySchema } from '@/lib/validation/layout';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { revalidatePublic } from '@/server/cache';
import { enqueueWebhookEvent } from '@/server/webhooks';

export const FRONT_LAYOUT_KEY = 'front';

export function sectionLayoutKey(sectionId: string): string {
  return `section:${sectionId}`;
}

/** The section id for `section:<uuid>` keys, null for `front`. */
export function sectionIdFromKey(key: string): string | null {
  return key.startsWith('section:') ? key.slice('section:'.length) : null;
}

export function isFrontKey(key: string): boolean {
  return key === FRONT_LAYOUT_KEY;
}

/** Default document for a section page: the newest stories large, then a list. */
export function defaultSectionLayout(section: Pick<Section, 'id' | 'name'>): LayoutDoc {
  return {
    version: 1,
    rows: [
      newRow(1, [
        newBlock('top-stories', {
          sectionId: section.id,
          limit: 4,
          showImages: true,
          showLead: true,
          showKicker: true,
        }),
      ]),
      newRow(1, [
        newBlock('list', {
          title: `Flere saker fra ${section.name}`,
          sectionId: section.id,
          limit: 10,
          showImages: true,
          showKicker: true,
        }),
      ]),
    ],
  };
}

async function loadSections(siteId: string): Promise<Section[]> {
  return db
    .select()
    .from(sections)
    .where(eq(sections.siteId, siteId))
    .orderBy(asc(sections.sortOrder), asc(sections.name));
}

async function findLayout(siteId: string, key: string): Promise<Layout | null> {
  const [row] = await db
    .select()
    .from(layouts)
    .where(and(eq(layouts.siteId, siteId), eq(layouts.key, key)))
    .limit(1);
  return row ?? null;
}

async function defaultDocFor(siteId: string, key: string): Promise<{ name: string; doc: LayoutDoc }> {
  if (isFrontKey(key)) return { name: 'Forside', doc: defaultFrontLayout(await loadSections(siteId)) };
  const sectionId = sectionIdFromKey(key);
  const [section] = sectionId
    ? await db
        .select()
        .from(sections)
        .where(and(eq(sections.siteId, siteId), eq(sections.id, sectionId)))
        .limit(1)
    : [];
  if (!section) throw new NotFoundError('Fant ikke seksjonen.');
  return { name: section.name, doc: defaultSectionLayout(section) };
}

/**
 * Load a layout, creating the row on demand with a sensible default draft.
 * Stored documents are parsed leniently so a corrupt row degrades to an
 * empty layout instead of breaking the editor.
 */
export async function getLayout(siteId: string, key: string, userId?: string): Promise<Layout> {
  const parsedKey = layoutKeySchema.parse(key);
  const existing = await findLayout(siteId, parsedKey);
  if (existing) {
    return {
      ...existing,
      draft: parseLayoutDoc(existing.draft),
      published: existing.published ? parseLayoutDoc(existing.published) : null,
    };
  }
  const { name, doc } = await defaultDocFor(siteId, parsedKey);
  const [created] = await db
    .insert(layouts)
    .values({ siteId, key: parsedKey, name, draft: doc, updatedBy: userId ?? null })
    .onConflictDoNothing({ target: [layouts.siteId, layouts.key] })
    .returning();
  if (created) return created;
  // Lost the race against a concurrent creator: read what they wrote.
  const raced = await findLayout(siteId, parsedKey);
  if (!raced) throw new ActionError('Kunne ikke opprette layouten.');
  return raced;
}

export function sameDoc(a: LayoutDoc | null | undefined, b: LayoutDoc | null | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function hasUnpublishedChanges(layout: Pick<Layout, 'draft' | 'published'>): boolean {
  return !sameDoc(layout.draft, layout.published);
}

/** Validate and store the draft. Returns the stored row. */
export async function saveDraft(
  ctx: AdminContext,
  key: string,
  doc: unknown,
  opts: { name?: string } = {},
): Promise<Layout> {
  const parsedKey = layoutKeySchema.parse(key);
  const parsedDoc = layoutDocSchema.parse(doc);
  await getLayout(ctx.site.id, parsedKey, ctx.user.id);
  const now = new Date();
  const [row] = await db
    .update(layouts)
    .set({
      draft: parsedDoc,
      ...(opts.name?.trim() ? { name: opts.name.trim().slice(0, 120) } : {}),
      updatedBy: ctx.user.id,
      updatedAt: now,
    })
    .where(and(eq(layouts.siteId, ctx.site.id), eq(layouts.key, parsedKey)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke layouten.');
  await auditFromContext(ctx, {
    action: 'layout.save_draft',
    entityType: 'layout',
    entityId: row.id,
    summary: `Lagret utkast til layout «${row.name}»`,
    data: { key: row.key, rows: parsedDoc.rows.length, pinned: layoutPinnedIds(parsedDoc).length },
  });
  return row;
}

/** Publish the draft: copy it to `published`, invalidate the public cache and notify webhooks. */
export async function publishLayout(ctx: AdminContext, key: string): Promise<Layout> {
  const parsedKey = layoutKeySchema.parse(key);
  const current = await getLayout(ctx.site.id, parsedKey, ctx.user.id);
  const doc = layoutDocSchema.parse(current.draft);
  if (doc.rows.length === 0) {
    throw new ActionError('Layouten er tom. Legg til minst én rad før du publiserer.', 'validation');
  }
  const now = new Date();
  const [row] = await db
    .update(layouts)
    .set({ published: doc, publishedAt: now, updatedBy: ctx.user.id, updatedAt: now })
    .where(and(eq(layouts.siteId, ctx.site.id), eq(layouts.key, parsedKey)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke layouten.');
  await auditFromContext(ctx, {
    action: 'layout.publish',
    entityType: 'layout',
    entityId: row.id,
    summary: `Publiserte layout «${row.name}»`,
    data: { key: row.key, rows: doc.rows.length, blocks: doc.rows.reduce((n, r) => n + r.blocks.length, 0) },
  });
  revalidatePublic(ctx.site.id);
  await enqueueWebhookEvent(ctx.site.id, 'layout.published', {
    id: row.id,
    key: row.key,
    name: row.name,
    sectionId: sectionIdFromKey(row.key),
    publishedAt: now.toISOString(),
    rows: doc.rows.length,
    pinnedArticleIds: layoutPinnedIds(doc),
  });
  return row;
}

/** Throw away draft changes: the draft becomes the published document (or the default when never published). */
export async function discardDraft(ctx: AdminContext, key: string): Promise<Layout> {
  const parsedKey = layoutKeySchema.parse(key);
  const current = await getLayout(ctx.site.id, parsedKey, ctx.user.id);
  const restored = current.published
    ? parseLayoutDoc(current.published)
    : (await defaultDocFor(ctx.site.id, parsedKey)).doc;
  const [row] = await db
    .update(layouts)
    .set({ draft: restored, updatedBy: ctx.user.id, updatedAt: new Date() })
    .where(and(eq(layouts.siteId, ctx.site.id), eq(layouts.key, parsedKey)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke layouten.');
  await auditFromContext(ctx, {
    action: 'layout.discard_draft',
    entityType: 'layout',
    entityId: row.id,
    summary: `Forkastet utkastet til layout «${row.name}»`,
    data: { key: row.key, restoredFrom: current.published ? 'published' : 'default' },
  });
  return row;
}

export type LayoutListItem = {
  key: string;
  name: string;
  /** Whether a layout row exists yet (sections without one show "Opprett"). */
  exists: boolean;
  hasDraftChanges: boolean;
  isPublished: boolean;
  publishedAt: Date | null;
  updatedAt: Date | null;
  sectionId: string | null;
  sectionSlug: string | null;
  rowCount: number;
};

/** The front page plus one entry per active section, in section order. */
export async function listLayouts(siteId: string): Promise<LayoutListItem[]> {
  const [rows, sectionRows] = await Promise.all([
    db.select().from(layouts).where(eq(layouts.siteId, siteId)),
    loadSections(siteId),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const toItem = (
    key: string,
    name: string,
    section: Pick<Section, 'id' | 'slug'> | null,
  ): LayoutListItem => {
    const row = byKey.get(key);
    const draft = row ? parseLayoutDoc(row.draft) : null;
    const published = row?.published ? parseLayoutDoc(row.published) : null;
    return {
      key,
      name: row?.name ?? name,
      exists: Boolean(row),
      hasDraftChanges: row ? !sameDoc(draft, published) : false,
      isPublished: Boolean(published),
      publishedAt: row?.publishedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      sectionId: section?.id ?? null,
      sectionSlug: section?.slug ?? null,
      rowCount: draft?.rows.length ?? 0,
    };
  };
  const items = [toItem(FRONT_LAYOUT_KEY, 'Forside', null)];
  for (const s of sectionRows) {
    if (!s.isActive) continue;
    items.push(toItem(sectionLayoutKey(s.id), s.name, s));
  }
  return items;
}
