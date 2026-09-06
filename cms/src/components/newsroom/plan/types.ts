/**
 * Serialisable shapes for the plan calendar (dates as ISO strings so server
 * components can hand them to the client chips and dialogs).
 */
import type { ArticleStatus } from '@/db/schema';
import type { PlanArticle, PlanEvent, PlanEventKind } from '@/server/plan/queries';

export type PlanArticleDto = {
  id: string;
  title: string;
  kicker: string | null;
  status: ArticleStatus;
  sectionId: string | null;
  sectionName: string | null;
  sectionColor: string | null;
  contentTypeName: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  plannedAt: string | null;
  deadlineAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  wordCount: number;
};

export type PlanEventDto = { kind: PlanEventKind; at: string; day: string; article: PlanArticleDto };

export type PlanPermissions = { userId: string; create: boolean; editAny: boolean; editOwn: boolean };

export type PlanOption = { id: string; name: string };

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toPlanArticleDto(a: PlanArticle): PlanArticleDto {
  return {
    id: a.id,
    title: a.title,
    kicker: a.kicker,
    status: a.status,
    sectionId: a.sectionId,
    sectionName: a.sectionName,
    sectionColor: a.sectionColor,
    contentTypeName: a.contentTypeName,
    createdBy: a.createdBy,
    assignedTo: a.assignedTo,
    assignedToName: a.assignedToName,
    plannedAt: iso(a.plannedAt),
    deadlineAt: iso(a.deadlineAt),
    scheduledAt: iso(a.scheduledAt),
    publishedAt: iso(a.publishedAt),
    wordCount: a.wordCount,
  };
}

export function toPlanEventDto(e: PlanEvent): PlanEventDto {
  return { kind: e.kind, at: e.at.toISOString(), day: e.day, article: toPlanArticleDto(e.article) };
}

export function canPlan(perm: PlanPermissions, article: Pick<PlanArticleDto, 'createdBy'>): boolean {
  return perm.editAny || (perm.editOwn && article.createdBy === perm.userId);
}
