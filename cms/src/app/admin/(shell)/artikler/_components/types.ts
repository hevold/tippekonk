/**
 * Serialisable row/permission shapes passed from the server page to the
 * client table (dates as ISO strings).
 */
import type { ArticleAccess, ArticleStatus } from '@/db/schema';
import type { ArticleListRow } from '@/server/articles/list';

export type ArticleRowDto = {
  id: string;
  title: string;
  kicker: string | null;
  status: ArticleStatus;
  access: ArticleAccess;
  isBreaking: boolean;
  isSponsored: boolean;
  sectionName: string | null;
  contentTypeName: string | null;
  updatedAt: string;
  updatedByName: string | null;
  createdBy: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  deadlineAt: string | null;
  plannedAt: string | null;
  deletedAt: string | null;
  wordCount: number;
  bylines: { id: string; name: string }[];
};

export type ListPermissions = {
  userId: string;
  create: boolean;
  editAny: boolean;
  editOwn: boolean;
  review: boolean;
  publish: boolean;
  delete: boolean;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toRowDto(row: ArticleListRow): ArticleRowDto {
  return {
    id: row.id,
    title: row.title,
    kicker: row.kicker,
    status: row.status,
    access: row.access,
    isBreaking: row.isBreaking,
    isSponsored: row.isSponsored,
    sectionName: row.sectionName,
    contentTypeName: row.contentTypeName,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName,
    createdBy: row.createdBy,
    publishedAt: iso(row.publishedAt),
    scheduledAt: iso(row.scheduledAt),
    assignedTo: row.assignedTo,
    assignedToName: row.assignedToName,
    deadlineAt: iso(row.deadlineAt),
    plannedAt: iso(row.plannedAt),
    deletedAt: iso(row.deletedAt),
    wordCount: row.wordCount,
    bylines: row.bylines,
  };
}

/** Whether the user may edit this particular row (SPEC 5.1). */
export function canEditRow(perm: ListPermissions, row: Pick<ArticleRowDto, 'createdBy'>): boolean {
  return perm.editAny || (perm.editOwn && row.createdBy === perm.userId);
}
