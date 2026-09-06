/**
 * Redaksjonsplan reads: the articles that appear on the planning calendar
 * (by plannedAt, deadlineAt, scheduledAt or publishedAt inside a date range)
 * and the "needs attention" panel (overdue deadlines, planned stories with
 * nobody assigned). Range helpers are pure and computed in Europe/Oslo so a
 * month view always starts on a Monday of the Oslo calendar.
 */
import 'server-only';

import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/db';
import { articles, contentTypes, sections, users, type ArticleStatus } from '@/db/schema';
import { formatDate, fromOsloParts, zonedParts } from '@/lib/dates';
import type { AdminContext } from '@/server/auth/context';
import { isOwnScoped } from '@/server/articles/list';

/* -------------------------------------------------------------------------- */
/*  Ranges (pure)                                                              */
/* -------------------------------------------------------------------------- */

export type PlanView = 'month' | 'week' | 'list';

export type PlanRange = {
  view: PlanView;
  /** Anchor date (any instant inside the period). */
  anchor: Date;
  /** First instant of the period (Oslo midnight). */
  from: Date;
  /** First instant after the period. */
  to: Date;
  /** Calendar grid bounds: Monday before `from` … the Monday after the last day. */
  gridFrom: Date;
  gridTo: Date;
  /** ISO dates (YYYY-MM-DD) for every day in the grid, in order. */
  days: string[];
  /** Human label: "september 2026" or "uke 37 · 7.–13. sep. 2026". */
  label: string;
  /** Anchors for navigation (ISO dates). */
  previous: string;
  next: string;
  today: string;
};

/** Oslo-midnight `days` days after `date` (date arithmetic on the Oslo calendar). */
export function addOsloDays(date: Date, days: number): Date {
  const p = zonedParts(date);
  return fromOsloParts({ year: p.year, month: p.month, day: p.day + days });
}

/** ISO date (YYYY-MM-DD) of the Oslo day containing `date`. */
export function osloDayKey(date: Date): string {
  return formatDate(date, 'iso-date');
}

/** Parse an ISO date from the URL into Oslo midnight; invalid → null. */
export function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = fromOsloParts({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) });
  const p = zonedParts(d);
  if (p.year !== Number(m[1]) || p.month !== Number(m[2]) || p.day !== Number(m[3])) return null;
  return d;
}

/** Monday (Oslo midnight) of the week containing `date`. */
export function startOfOsloWeek(date: Date): Date {
  const p = zonedParts(date);
  const offset = (p.weekday + 6) % 7; // Monday = 0
  return fromOsloParts({ year: p.year, month: p.month, day: p.day - offset });
}

/** ISO 8601 week number of the Oslo day containing `date`. */
export function isoWeek(date: Date): number {
  const p = zonedParts(date);
  const utc = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1);
  return Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

const MONTHS = new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'Europe/Oslo' });
const DAY_MONTH = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', timeZone: 'Europe/Oslo' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('nb-NO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Oslo',
});

function dayKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor < to && guard < 60) {
    out.push(osloDayKey(cursor));
    cursor = addOsloDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export function planRange(view: PlanView, anchor: Date, now: Date = new Date()): PlanRange {
  const p = zonedParts(anchor);
  const today = osloDayKey(now);
  if (view === 'month') {
    const from = fromOsloParts({ year: p.year, month: p.month, day: 1 });
    const to = fromOsloParts({ year: p.year, month: p.month + 1, day: 1 });
    const gridFrom = startOfOsloWeek(from);
    const lastDay = addOsloDays(to, -1);
    const gridTo = addOsloDays(startOfOsloWeek(lastDay), 7);
    return {
      view,
      anchor,
      from,
      to,
      gridFrom,
      gridTo,
      days: dayKeys(gridFrom, gridTo),
      label: MONTHS.format(from),
      previous: osloDayKey(fromOsloParts({ year: p.year, month: p.month - 1, day: 1 })),
      next: osloDayKey(to),
      today,
    };
  }
  // week and list share a 7-day window starting on Monday
  const from = startOfOsloWeek(anchor);
  const to = addOsloDays(from, 7);
  const last = addOsloDays(from, 6);
  const sameMonth = zonedParts(from).month === zonedParts(last).month;
  const label = `uke ${isoWeek(from)} · ${sameMonth ? zonedParts(from).day + '.' : DAY_MONTH.format(from)}–${DAY_MONTH_YEAR.format(last)}`;
  return {
    view,
    anchor,
    from,
    to,
    gridFrom: from,
    gridTo: to,
    days: dayKeys(from, to),
    label,
    previous: osloDayKey(addOsloDays(from, -7)),
    next: osloDayKey(to),
    today,
  };
}

/* -------------------------------------------------------------------------- */
/*  Articles on the plan                                                       */
/* -------------------------------------------------------------------------- */

export type PlanArticle = {
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
  plannedAt: Date | null;
  deadlineAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  wordCount: number;
};

export type PlanEventKind = 'planned' | 'deadline' | 'scheduled' | 'published';

export type PlanEvent = {
  kind: PlanEventKind;
  at: Date;
  day: string;
  article: PlanArticle;
};

const assignee = alias(users, 'assignee');

const planSelection = {
  id: articles.id,
  title: articles.title,
  kicker: articles.kicker,
  status: articles.status,
  sectionId: articles.sectionId,
  sectionName: sections.name,
  sectionColor: sections.color,
  contentTypeName: contentTypes.name,
  createdBy: articles.createdBy,
  assignedTo: articles.assignedTo,
  assignedToName: assignee.name,
  plannedAt: articles.plannedAt,
  deadlineAt: articles.deadlineAt,
  scheduledAt: articles.scheduledAt,
  publishedAt: articles.publishedAt,
  updatedAt: articles.updatedAt,
  wordCount: articles.wordCount,
};

function baseWhere(ctx: AdminContext): SQL[] {
  const clauses: SQL[] = [eq(articles.siteId, ctx.site.id), isNull(articles.deletedAt)];
  if (isOwnScoped(ctx)) clauses.push(eq(articles.createdBy, ctx.user.id));
  return clauses;
}

function planQuery() {
  return db
    .select(planSelection)
    .from(articles)
    .leftJoin(sections, eq(sections.id, articles.sectionId))
    .leftJoin(contentTypes, eq(contentTypes.id, articles.contentTypeId))
    .leftJoin(assignee, eq(assignee.id, articles.assignedTo));
}

/** Articles with any planning/publication date inside [from, to). */
export async function listPlanArticles(ctx: AdminContext, range: { from: Date; to: Date }): Promise<PlanArticle[]> {
  const inRange = (col: PgColumn) => and(gte(col, range.from), lt(col, range.to));
  const rows = await planQuery()
    .where(
      and(
        ...baseWhere(ctx),
        ne(articles.status, 'archived'),
        or(
          inRange(articles.plannedAt),
          inRange(articles.deadlineAt),
          inRange(articles.scheduledAt),
          inRange(articles.publishedAt),
        ),
      ),
    )
    .orderBy(asc(articles.plannedAt), asc(articles.deadlineAt), asc(articles.title));
  return rows;
}

/** Explode articles into calendar events inside the range (pure). */
export function eventsForRange(list: PlanArticle[], range: { from: Date; to: Date }): PlanEvent[] {
  const events: PlanEvent[] = [];
  const push = (kind: PlanEventKind, at: Date | null, article: PlanArticle) => {
    if (!at || at < range.from || at >= range.to) return;
    events.push({ kind, at, day: osloDayKey(at), article });
  };
  for (const a of list) {
    // A published article shows only its publish date; a scheduled one only its slot.
    if (a.status === 'published' || a.status === 'unpublished') {
      push('published', a.publishedAt, a);
      continue;
    }
    if (a.status === 'scheduled') {
      push('scheduled', a.scheduledAt, a);
      push('deadline', a.deadlineAt, a);
      continue;
    }
    push('planned', a.plannedAt, a);
    push('deadline', a.deadlineAt, a);
  }
  events.sort((x, y) => x.at.getTime() - y.at.getTime() || x.article.title.localeCompare(y.article.title, 'nb'));
  return events;
}

export function groupEventsByDay(events: PlanEvent[]): Map<string, PlanEvent[]> {
  const map = new Map<string, PlanEvent[]>();
  for (const e of events) {
    const list = map.get(e.day) ?? [];
    list.push(e);
    map.set(e.day, list);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/*  Attention panel                                                            */
/* -------------------------------------------------------------------------- */

export type PlanAttention = { overdue: PlanArticle[]; unassigned: PlanArticle[]; undated: PlanArticle[] };

const OPEN_STATUSES: ArticleStatus[] = ['draft', 'in_review', 'approved'];

/** Overdue deadlines, planned stories without an assignee, and open stories with no dates at all (limited). */
export async function listPlanAttention(ctx: AdminContext, now: Date = new Date(), limit = 20): Promise<PlanAttention> {
  const open = and(...baseWhere(ctx), inArray(articles.status, OPEN_STATUSES));
  const [overdue, unassigned, undated] = await Promise.all([
    planQuery()
      .where(and(open, lte(articles.deadlineAt, now)))
      .orderBy(asc(articles.deadlineAt))
      .limit(limit),
    planQuery()
      .where(and(open, isNull(articles.assignedTo), or(gte(articles.plannedAt, now), gte(articles.deadlineAt, now))))
      .orderBy(sql`coalesce(${articles.plannedAt}, ${articles.deadlineAt}) asc`)
      .limit(limit),
    planQuery()
      .where(and(open, isNull(articles.plannedAt), isNull(articles.deadlineAt)))
      .orderBy(asc(articles.updatedAt))
      .limit(limit),
  ]);
  return { overdue, unassigned, undated };
}
