/**
 * Dashboard ("Skrivebord") reads. One call, `getDashboardData(ctx)`, gathers
 * everything the page renders: the user's own stories, the desk queue, what
 * is scheduled or planned in the next week, the latest published stories,
 * overdue deadlines, stat counters, most-read (article_views) and the
 * activity feed built from the audit log. Contributors are scoped to their
 * own articles everywhere; the review queue is only fetched for reviewers.
 */
import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/db';
import { articleViews, articles, auditLog, notifications, sections, users, type ArticleStatus, type Notification } from '@/db/schema';
import { formatDate, fromOsloParts, startOfOsloDay, zonedParts } from '@/lib/dates';
import { isOwnScoped } from '@/server/articles/list';
import type { AdminContext } from '@/server/auth/context';
import { listNotifications } from '@/server/notifications';

import { activityIcon, describeActivity, type ActivityIcon } from './activity';

export type { ActivityIcon } from './activity';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type DashboardArticle = {
  id: string;
  title: string;
  kicker: string | null;
  status: ArticleStatus;
  sectionName: string | null;
  updatedAt: Date;
  updatedByName: string | null;
  createdBy: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  deadlineAt: Date | null;
  plannedAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  wordCount: number;
};

export type UpcomingItem = DashboardArticle & { kind: 'scheduled' | 'planned' | 'deadline'; at: Date };

export type MostReadItem = { id: string; title: string; sectionName: string | null; views: number; publishedAt: Date | null };

export type ActivityItem = {
  id: string;
  action: string;
  text: string;
  icon: ActivityIcon;
  entityType: string | null;
  entityId: string | null;
  createdAt: Date;
};

export type DashboardStats = {
  publishedToday: number;
  publishedThisWeek: number;
  drafts: number;
  inReview: number;
  approved: number;
  scheduled: number;
  overdue: number;
  viewsLast7Days: number;
};

export type DashboardData = {
  myArticles: DashboardArticle[];
  reviewQueue: DashboardArticle[] | null;
  upcoming: UpcomingItem[];
  recentlyPublished: DashboardArticle[];
  overdue: DashboardArticle[];
  stats: DashboardStats;
  mostRead: MostReadItem[];
  activity: ActivityItem[];
  unreadNotifications: Notification[];
  unreadCount: number;
};

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                            */
/* -------------------------------------------------------------------------- */

const updater = alias(users, 'updater');
const assignee = alias(users, 'assignee');

const selection = {
  id: articles.id,
  title: articles.title,
  kicker: articles.kicker,
  status: articles.status,
  sectionName: sections.name,
  updatedAt: articles.updatedAt,
  updatedByName: updater.name,
  createdBy: articles.createdBy,
  assignedTo: articles.assignedTo,
  assignedToName: assignee.name,
  deadlineAt: articles.deadlineAt,
  plannedAt: articles.plannedAt,
  scheduledAt: articles.scheduledAt,
  publishedAt: articles.publishedAt,
  wordCount: articles.wordCount,
};

function query() {
  return db
    .select(selection)
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(updater, eq(updater.id, articles.updatedBy))
    .leftJoin(assignee, eq(assignee.id, articles.assignedTo));
}

function scope(ctx: AdminContext): SQL[] {
  const clauses: SQL[] = [eq(articles.siteId, ctx.site.id), isNull(articles.deletedAt)];
  if (isOwnScoped(ctx)) clauses.push(eq(articles.createdBy, ctx.user.id));
  return clauses;
}

const OPEN: ArticleStatus[] = ['draft', 'in_review', 'approved'];

/** Assigned to me or created by me and not yet published, freshest first. */
export async function listMyArticles(ctx: AdminContext, limit = 8): Promise<DashboardArticle[]> {
  return query()
    .where(
      and(
        ...scope(ctx),
        inArray(articles.status, ['draft', 'in_review', 'approved', 'scheduled', 'unpublished']),
        or(eq(articles.assignedTo, ctx.user.id), eq(articles.createdBy, ctx.user.id)),
      ),
    )
    .orderBy(desc(articles.updatedAt))
    .limit(limit);
}

/** Stories waiting for the desk (in_review), oldest first so nothing gets buried. */
export async function listReviewQueue(ctx: AdminContext, limit = 8): Promise<DashboardArticle[]> {
  return query()
    .where(and(...scope(ctx), eq(articles.status, 'in_review')))
    .orderBy(asc(articles.updatedAt))
    .limit(limit);
}

/** Scheduled publications, planned stories and deadlines in the next `days` days. */
export async function listUpcoming(ctx: AdminContext, now: Date, days = 7, limit = 10): Promise<UpcomingItem[]> {
  const from = startOfOsloDay(now);
  const p = zonedParts(from);
  const to = fromOsloParts({ year: p.year, month: p.month, day: p.day + days });
  const within = (col: PgColumn) => and(gte(col, from), lt(col, to));
  const rows = await query()
    .where(
      and(
        ...scope(ctx),
        inArray(articles.status, ['draft', 'in_review', 'approved', 'scheduled']),
        or(within(articles.scheduledAt), within(articles.plannedAt), within(articles.deadlineAt)),
      ),
    )
    .orderBy(asc(articles.scheduledAt), asc(articles.plannedAt), asc(articles.deadlineAt))
    .limit(limit * 3);
  const items: UpcomingItem[] = [];
  for (const row of rows) {
    if (row.status === 'scheduled' && row.scheduledAt && row.scheduledAt >= from && row.scheduledAt < to) {
      items.push({ ...row, kind: 'scheduled', at: row.scheduledAt });
      continue;
    }
    if (row.plannedAt && row.plannedAt >= from && row.plannedAt < to) items.push({ ...row, kind: 'planned', at: row.plannedAt });
    else if (row.deadlineAt && row.deadlineAt >= from && row.deadlineAt < to) items.push({ ...row, kind: 'deadline', at: row.deadlineAt });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return items.slice(0, limit);
}

export async function listRecentlyPublished(ctx: AdminContext, limit = 8): Promise<DashboardArticle[]> {
  return query()
    .where(and(...scope(ctx), eq(articles.status, 'published')))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
}

/** Open stories whose deadline has passed, most overdue first. */
export async function listOverdue(ctx: AdminContext, now: Date, limit = 8): Promise<DashboardArticle[]> {
  return query()
    .where(and(...scope(ctx), inArray(articles.status, OPEN), lte(articles.deadlineAt, now)))
    .orderBy(asc(articles.deadlineAt))
    .limit(limit);
}

export async function getDashboardStats(ctx: AdminContext, now: Date): Promise<DashboardStats> {
  const dayStart = startOfOsloDay(now);
  const p = zonedParts(dayStart);
  const weekStart = fromOsloParts({ year: p.year, month: p.month, day: p.day - ((p.weekday + 6) % 7) });
  const base = and(...scope(ctx));
  const countWhere = async (where: SQL | undefined) => {
    const [row] = await db.select({ value: count() }).from(articles).where(where);
    return row?.value ?? 0;
  };
  const [publishedToday, publishedThisWeek, byStatus, overdue, viewsRow] = await Promise.all([
    countWhere(and(base, eq(articles.status, 'published'), gte(articles.publishedAt, dayStart))),
    countWhere(and(base, eq(articles.status, 'published'), gte(articles.publishedAt, weekStart))),
    db.select({ status: articles.status, value: count() }).from(articles).where(base).groupBy(articles.status),
    countWhere(and(base, inArray(articles.status, OPEN), lte(articles.deadlineAt, now))),
    db
      .select({ value: sql<number>`coalesce(sum(${articleViews.views}), 0)`.mapWith(Number) })
      .from(articleViews)
      .innerJoin(articles, eq(articles.id, articleViews.articleId))
      .where(and(base, gte(articleViews.day, formatDate(fromOsloParts({ year: p.year, month: p.month, day: p.day - 6 }), 'iso-date')))),
  ]);
  const byStatusMap = new Map(byStatus.map((r) => [r.status, Number(r.value)]));
  return {
    publishedToday,
    publishedThisWeek,
    drafts: byStatusMap.get('draft') ?? 0,
    inReview: byStatusMap.get('in_review') ?? 0,
    approved: byStatusMap.get('approved') ?? 0,
    scheduled: byStatusMap.get('scheduled') ?? 0,
    overdue,
    viewsLast7Days: viewsRow[0]?.value ?? 0,
  };
}

/** Most read articles over the last `days` Oslo days (article_views is a per-day counter). */
export async function listMostRead(ctx: AdminContext, now: Date, days = 7, limit = 5): Promise<MostReadItem[]> {
  const p = zonedParts(startOfOsloDay(now));
  const since = formatDate(fromOsloParts({ year: p.year, month: p.month, day: p.day - (days - 1) }), 'iso-date');
  const total = sql<number>`sum(${articleViews.views})`.mapWith(Number);
  return db
    .select({
      id: articles.id,
      title: articles.title,
      sectionName: sections.name,
      publishedAt: articles.publishedAt,
      views: total,
    })
    .from(articleViews)
    .innerJoin(articles, eq(articles.id, articleViews.articleId))
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .where(and(...scope(ctx), gte(articleViews.day, since)))
    .groupBy(articles.id, sections.name)
    .orderBy(desc(total), desc(articles.publishedAt))
    .limit(limit);
}

/** The last `limit` audit entries for the site as readable sentences. */
export async function listActivity(ctx: AdminContext, limit = 20): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      summary: auditLog.summary,
      data: auditLog.data,
      createdAt: auditLog.createdAt,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(eq(auditLog.siteId, ctx.site.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    text: describeActivity(r, r.actorName),
    icon: activityIcon(r.action),
    entityType: r.entityType,
    entityId: r.entityId,
    createdAt: r.createdAt,
  }));
}

export async function getDashboardData(ctx: AdminContext, now: Date = new Date()): Promise<DashboardData> {
  const canReview = ctx.can('article:review');
  const [myArticles, reviewQueue, upcoming, recentlyPublished, overdue, stats, mostRead, activity, unread, unreadRow] =
    await Promise.all([
      listMyArticles(ctx),
      canReview ? listReviewQueue(ctx) : Promise.resolve(null),
      listUpcoming(ctx, now),
      listRecentlyPublished(ctx),
      listOverdue(ctx, now),
      getDashboardStats(ctx, now),
      listMostRead(ctx, now),
      ctx.can('audit:view') || ctx.can('article:review') ? listActivity(ctx) : Promise.resolve([]),
      listNotifications(ctx.user.id, { unreadOnly: true, limit: 6 }),
      db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, ctx.user.id), isNull(notifications.readAt))),
    ]);
  return {
    myArticles,
    reviewQueue,
    upcoming,
    recentlyPublished,
    overdue,
    stats,
    mostRead,
    activity,
    unreadNotifications: unread,
    unreadCount: unreadRow[0]?.value ?? 0,
  };
}
