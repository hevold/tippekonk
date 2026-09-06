/**
 * Redaksjonsplan mutations: assignee, deadline and planned date on an
 * article, as a partial patch so the calendar can move a story without
 * touching its assignee. Independent of the editor's assign flow on purpose
 * (SPEC: the plan owns its own actions) but writes the same columns and the
 * same notification kind, so the assignee experience is identical.
 */
import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { articles, memberships, type Article } from '@/db/schema';
import { adminPaths } from '@/config/routes';
import { formatDate } from '@/lib/dates';
import { nullableDate, optionalUuidSchema, uuidSchema } from '@/lib/validation/common';
import { ActionError, ForbiddenError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { notify } from '@/server/notifications';

export const planningPatchSchema = z.object({
  id: uuidSchema,
  assignedTo: optionalUuidSchema.optional(),
  deadlineAt: nullableDate.optional(),
  plannedAt: nullableDate.optional(),
});
export type PlanningPatchInput = z.input<typeof planningPatchSchema>;

export type PlanningPatch = {
  assignedTo?: string | null;
  deadlineAt?: Date | null;
  plannedAt?: Date | null;
};

/** Keys the caller actually sent (Zod defaults would otherwise look like explicit nulls). */
export function pickPlanningPatch(raw: unknown, parsed: z.infer<typeof planningPatchSchema>): PlanningPatch {
  const keys = raw && typeof raw === 'object' ? new Set(Object.keys(raw)) : new Set<string>();
  const patch: PlanningPatch = {};
  if (keys.has('assignedTo')) patch.assignedTo = parsed.assignedTo ?? null;
  if (keys.has('deadlineAt')) patch.deadlineAt = parsed.deadlineAt ?? null;
  if (keys.has('plannedAt')) patch.plannedAt = parsed.plannedAt ?? null;
  return patch;
}

function titleOf(article: Pick<Article, 'title'>): string {
  return article.title.trim() || '(uten tittel)';
}

/** Contributors may only plan their own stories; everyone else needs article:edit_any. */
function assertMayPlan(ctx: AdminContext, article: Article): void {
  if (ctx.can('article:edit_any')) return;
  if (ctx.can('article:edit_own') && article.createdBy === ctx.user.id) return;
  throw new ForbiddenError('Du kan ikke endre planleggingen for denne saken.');
}

export async function updatePlanning(ctx: AdminContext, id: string, patch: PlanningPatch): Promise<Article> {
  assertCan(ctx, 'article:edit_own');
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.siteId, ctx.site.id), eq(articles.id, id)))
    .limit(1);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (article.deletedAt) throw new ActionError('Saken ligger i papirkurven.', 'conflict');
  assertMayPlan(ctx, article);

  if (patch.assignedTo) {
    const [member] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, patch.assignedTo)))
      .limit(1);
    if (!member) {
      throw new ActionError('Brukeren er ikke medlem av redaksjonen.', 'validation', {
        assignedTo: ['Ugyldig bruker'],
      });
    }
  }
  if (Object.keys(patch).length === 0) return article;

  const [updated] = await db
    .update(articles)
    .set({ ...patch, updatedBy: ctx.user.id, updatedAt: new Date() })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');

  const changes: string[] = [];
  if ('assignedTo' in patch) changes.push(patch.assignedTo ? 'tildelt' : 'fjernet tildeling');
  if ('deadlineAt' in patch)
    changes.push(patch.deadlineAt ? `frist ${formatDate(patch.deadlineAt, 'datetime')}` : 'frist fjernet');
  if ('plannedAt' in patch)
    changes.push(
      patch.plannedAt ? `planlagt ${formatDate(patch.plannedAt, 'datetime')}` : 'fjernet fra planen',
    );
  await auditFromContext(ctx, {
    action: 'article.plan',
    entityType: 'article',
    entityId: updated.id,
    summary: `Planla «${titleOf(updated)}»: ${changes.join(', ')}`,
    data: {
      assignedTo: updated.assignedTo,
      deadlineAt: updated.deadlineAt?.toISOString() ?? null,
      plannedAt: updated.plannedAt?.toISOString() ?? null,
    },
  });

  const link = adminPaths.article(updated.id);
  const newAssignee =
    patch.assignedTo && patch.assignedTo !== article.assignedTo && patch.assignedTo !== ctx.user.id;
  if (newAssignee) {
    await notify([patch.assignedTo!], {
      siteId: ctx.site.id,
      kind: 'article.assigned',
      title: `Du er tildelt «${titleOf(updated)}»`,
      body: updated.deadlineAt
        ? `Frist ${formatDate(updated.deadlineAt, 'datetime')}.`
        : `${ctx.user.name} tildelte deg saken.`,
      link,
    });
  } else if (
    ('deadlineAt' in patch || 'plannedAt' in patch) &&
    updated.assignedTo &&
    updated.assignedTo !== ctx.user.id
  ) {
    // Someone else changed the dates of a story you own: tell you.
    await notify([updated.assignedTo], {
      siteId: ctx.site.id,
      kind: 'article.rescheduled',
      title: `«${titleOf(updated)}» er flyttet i redaksjonsplanen`,
      body: changes.join(', '),
      link,
    });
  }
  return updated;
}
