/**
 * Content type reads for /admin/innholdstyper: the list with field and
 * article counts, and a single type for the edit page. Stored `fields` are
 * re-validated on read so a hand-edited JSON column can never crash the
 * editor.
 */
import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { articles, contentTypes, type ContentType } from '@/db/schema';
import { fieldDefSchema, type FieldDef } from '@/lib/validation/site';

export type ContentTypeWithCounts = ContentType & { articleCount: number; fieldCount: number };

/** Keep only well-formed field definitions. */
export function safeFields(raw: unknown): FieldDef[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldDef[] = [];
  for (const item of raw) {
    const parsed = fieldDefSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function listContentTypesWithCounts(siteId: string): Promise<ContentTypeWithCounts[]> {
  const rows = await db
    .select({
      contentType: contentTypes,
      articleCount: sql<number>`count(${articles.id})`.mapWith(Number),
    })
    .from(contentTypes)
    .leftJoin(articles, and(eq(articles.contentTypeId, contentTypes.id), isNull(articles.deletedAt)))
    .where(eq(contentTypes.siteId, siteId))
    .groupBy(contentTypes.id)
    .orderBy(asc(contentTypes.sortOrder), asc(contentTypes.name));
  return rows.map((r) => {
    const fields = safeFields(r.contentType.fields);
    return { ...r.contentType, fields, articleCount: r.articleCount, fieldCount: fields.length };
  });
}

export async function getContentTypeWithCounts(
  siteId: string,
  id: string,
): Promise<ContentTypeWithCounts | null> {
  const all = await listContentTypesWithCounts(siteId);
  return all.find((c) => c.id === id) ?? null;
}
