'use server';
/**
 * Server action behind the command palette's article search. Matches article
 * titles (and kicker) in the active site, scoped by the caller's permissions:
 * users without `article:edit_any` (contributors) only see their own articles.
 */
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { adminPaths } from '@/config/routes';
import { db } from '@/db';
import { articles, sections } from '@/db/schema';
import { t } from '@/lib/i18n';
import { runAction, type ActionResult } from '@/server/actions';
import { getAdminContext } from '@/server/auth/context';

import type { PaletteSearchResult } from '@/components/ui/command-palette';

const querySchema = z.string().trim().min(2).max(100);

const LIMIT = 8;

/** Escape LIKE wildcards so a literal "%" in the query does not match everything. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function searchArticlesForPalette(input: string): Promise<ActionResult<PaletteSearchResult[]>> {
  return runAction(async () => {
    const ctx = await getAdminContext();
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) return [];
    const pattern = `%${escapeLike(parsed.data)}%`;

    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        kicker: articles.kicker,
        status: articles.status,
        sectionName: sections.name,
      })
      .from(articles)
      .leftJoin(sections, eq(articles.sectionId, sections.id))
      .where(
        and(
          eq(articles.siteId, ctx.site.id),
          isNull(articles.deletedAt),
          ctx.can('article:edit_any') ? undefined : eq(articles.createdBy, ctx.user.id),
          or(ilike(articles.title, pattern), ilike(sql`coalesce(${articles.kicker}, '')`, pattern)),
        ),
      )
      .orderBy(desc(articles.updatedAt))
      .limit(LIMIT);

    return rows.map((row) => ({
      id: row.id,
      title: row.title.trim() || t('dashboard.untitled'),
      description: [row.kicker, row.sectionName].filter(Boolean).join(' · ') || undefined,
      href: adminPaths.article(row.id),
      status: row.status,
    }));
  });
}
