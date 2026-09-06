/**
 * Small taxonomy helpers the editor sidebar needs: list tags, create a tag
 * on the fly from the "Stikkord" combobox, and resolve ids to names when
 * rendering revision diffs. The full taxonomy admin belongs to the newsroom
 * area (src/server/taxonomy); this module only covers what the editor
 * page uses while writing.
 */
import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { authors, media, sections, tags, type ArticleSnapshot, type Tag } from '@/db/schema';
import { slugify, uniqueSlug } from '@/lib/text/slug';
import { ActionError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';

export type TagOption = { id: string; name: string; slug: string };

export async function listTags(siteId: string): Promise<TagOption[]> {
  return db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.siteId, siteId))
    .orderBy(asc(tags.name));
}

/**
 * Create a tag by name (idempotent: an existing tag with the same name or
 * slug is returned instead). Any user who may write articles may add tags —
 * a newsroom expects "nytt stikkord" to work mid-sentence.
 */
export async function createTagQuick(ctx: AdminContext, name: string): Promise<Tag> {
  if (!ctx.can('article:create'))
    throw new ActionError('Du har ikke tilgang til å opprette stikkord.', 'forbidden');
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed)
    throw new ActionError('Skriv et navn på stikkordet.', 'validation', { name: ['Navn må fylles ut'] });
  if (trimmed.length > 80) throw new ActionError('Navnet kan ikke være lengre enn 80 tegn.', 'validation');
  const base = slugify(trimmed) || 'stikkord';

  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.siteId, ctx.site.id), eq(tags.slug, base)))
    .limit(1);
  if (existing[0]) return existing[0];
  const byName = await db.select().from(tags).where(eq(tags.siteId, ctx.site.id));
  const sameName = byName.find(
    (t) => t.name.toLocaleLowerCase('nb-NO') === trimmed.toLocaleLowerCase('nb-NO'),
  );
  if (sameName) return sameName;

  const slug = await uniqueSlug(base, async (candidate) => {
    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.siteId, ctx.site.id), eq(tags.slug, candidate)))
      .limit(1);
    return rows.length > 0;
  });
  const [tag] = await db.insert(tags).values({ siteId: ctx.site.id, name: trimmed, slug }).returning();
  if (!tag) throw new Error('Kunne ikke opprette stikkordet.');
  await auditFromContext(ctx, {
    action: 'tag.create',
    entityType: 'tag',
    entityId: tag.id,
    summary: `Opprettet stikkordet «${tag.name}» fra editoren`,
  });
  return tag;
}

/**
 * Build a resolver that turns snapshot ids (section, tags, bylines, media)
 * into names for the revision diff view.
 */
export async function resolveSnapshotValue(
  siteId: string,
  snapshots: ArticleSnapshot[],
): Promise<(field: string, value: unknown) => string> {
  const sectionIds = new Set<string>();
  const tagIds = new Set<string>();
  const authorIds = new Set<string>();
  const mediaIds = new Set<string>();
  for (const s of snapshots) {
    if (s.sectionId) sectionIds.add(s.sectionId);
    for (const t of s.tagIds ?? []) tagIds.add(t);
    for (const b of s.bylines ?? []) authorIds.add(b.authorId);
    if (s.featuredMediaId) mediaIds.add(s.featuredMediaId);
  }
  const [sectionRows, tagRows, authorRows, mediaRows] = await Promise.all([
    sectionIds.size
      ? db
          .select({ id: sections.id, name: sections.name })
          .from(sections)
          .where(and(eq(sections.siteId, siteId), inArray(sections.id, [...sectionIds])))
      : [],
    tagIds.size
      ? db
          .select({ id: tags.id, name: tags.name })
          .from(tags)
          .where(and(eq(tags.siteId, siteId), inArray(tags.id, [...tagIds])))
      : [],
    authorIds.size
      ? db
          .select({ id: authors.id, name: authors.name })
          .from(authors)
          .where(and(eq(authors.siteId, siteId), inArray(authors.id, [...authorIds])))
      : [],
    mediaIds.size
      ? db
          .select({ id: media.id, name: media.filename })
          .from(media)
          .where(and(eq(media.siteId, siteId), inArray(media.id, [...mediaIds])))
      : [],
  ]);
  const names = new Map<string, string>();
  for (const r of [...sectionRows, ...tagRows, ...authorRows, ...mediaRows]) names.set(r.id, r.name);
  const ROLE: Record<string, string> = {
    text: 'tekst',
    photo: 'foto',
    video: 'video',
    graphics: 'grafikk',
    other: 'annet',
  };

  return (field, value) => {
    if (value === null || value === undefined) return '';
    switch (field) {
      case 'sectionId':
      case 'featuredMediaId':
        return typeof value === 'string' ? (names.get(value) ?? value) : String(value);
      case 'tagIds':
        return Array.isArray(value)
          ? value.map((v) => names.get(String(v)) ?? String(v)).join(', ')
          : String(value);
      case 'bylines':
        return Array.isArray(value)
          ? value
              .map((b) => {
                const row = b as { authorId?: string; role?: string };
                const name = names.get(row.authorId ?? '') ?? row.authorId ?? '';
                return row.role && row.role !== 'text' ? `${name} (${ROLE[row.role] ?? row.role})` : name;
              })
              .join(', ')
          : String(value);
      case 'access':
        return value === 'plus' ? 'Pluss' : 'Åpen';
      case 'isBreaking':
      case 'isSponsored':
        return value ? 'Ja' : 'Nei';
      case 'customFields':
        return Object.entries(value as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join('\n');
      default:
        return typeof value === 'string' ? value : JSON.stringify(value);
    }
  };
}
