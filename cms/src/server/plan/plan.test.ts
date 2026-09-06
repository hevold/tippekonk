import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articles, auditLog, notifications, type MemberRole, type User } from '@/db/schema';
import { can, type Permission } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import { ForbiddenError } from '@/server/actions';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
  requirePermission: async () => {
    throw new Error('requirePermission is not available in service tests');
  },
}));

import {
  addOsloDays,
  eventsForRange,
  groupEventsByDay,
  isoWeek,
  listPlanArticles,
  listPlanAttention,
  osloDayKey,
  parseIsoDate,
  planRange,
  startOfOsloWeek,
  type PlanArticle,
} from './queries';
import { pickPlanningPatch, planningPatchSchema, updatePlanning } from './service';

let db: Db;
let seed: SeedMinimalResult;

function ctxFor(user: User, role: MemberRole): AdminContext {
  return {
    user,
    site: seed.site,
    settings: parseSiteSettings(seed.site.settings),
    role,
    sites: [seed.site],
    locale: 'nb',
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip: null,
    sessionId: 'test-session',
  };
}
const editor = () => ctxFor(seed.editor, 'editor');
const contributor = () => ctxFor(seed.contributor, 'contributor');

async function insertArticle(spec: Partial<typeof articles.$inferInsert> & { title: string }) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      sectionId: seed.section.id,
      slug: spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + Math.random().toString(36).slice(2, 6),
      createdBy: seed.journalist.id,
      ...spec,
    })
    .returning();
  return row!;
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('range helpers (Europe/Oslo)', () => {
  it('builds a month grid from Monday to Sunday', () => {
    const range = planRange('month', new Date('2026-09-15T12:00:00Z'), new Date('2026-09-06T08:00:00Z'));
    expect(osloDayKey(range.from)).toBe('2026-09-01');
    expect(osloDayKey(range.to)).toBe('2026-10-01');
    expect(range.days[0]).toBe('2026-08-31'); // Monday
    expect(range.days[range.days.length - 1]).toBe('2026-10-04'); // Sunday
    expect(range.days.length % 7).toBe(0);
    expect(range.label).toBe('september 2026');
    expect(range.previous).toBe('2026-08-01');
    expect(range.next).toBe('2026-10-01');
    expect(range.today).toBe('2026-09-06');
  });

  it('builds a week window and labels it with the ISO week', () => {
    const range = planRange('week', new Date('2026-09-09T12:00:00Z'));
    expect(range.days).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ]);
    expect(range.label).toContain('uke 37');
    expect(range.previous).toBe('2026-08-31');
    expect(range.next).toBe('2026-09-14');
    expect(isoWeek(new Date('2026-01-01T12:00:00Z'))).toBe(1);
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe(53);
  });

  it('handles Oslo midnight around DST and parses ISO dates', () => {
    // 2026-03-29 is the spring DST change in Europe/Oslo.
    const sat = parseIsoDate('2026-03-28')!;
    expect(osloDayKey(addOsloDays(sat, 1))).toBe('2026-03-29');
    expect(osloDayKey(addOsloDays(sat, 2))).toBe('2026-03-30');
    expect(osloDayKey(startOfOsloWeek(new Date('2026-09-06T21:00:00Z')))).toBe('2026-08-31');
    expect(parseIsoDate('2026-02-31')).toBeNull();
    expect(parseIsoDate('nope')).toBeNull();
    // 23:30 UTC on the 6th is already the 7th in Oslo.
    expect(osloDayKey(new Date('2026-09-06T23:30:00Z'))).toBe('2026-09-07');
  });
});

describe('events', () => {
  const base: PlanArticle = {
    id: 'a',
    title: 'Sak',
    kicker: null,
    status: 'draft',
    sectionId: null,
    sectionName: null,
    sectionColor: null,
    contentTypeName: null,
    createdBy: null,
    assignedTo: null,
    assignedToName: null,
    plannedAt: null,
    deadlineAt: null,
    scheduledAt: null,
    publishedAt: null,
    updatedAt: new Date(),
    wordCount: 0,
  };
  const range = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };

  it('explodes planning dates into events by status and groups them by Oslo day', () => {
    const events = eventsForRange(
      [
        {
          ...base,
          id: 'draft',
          plannedAt: new Date('2026-09-10T08:00:00Z'),
          deadlineAt: new Date('2026-09-09T12:00:00Z'),
        },
        {
          ...base,
          id: 'sched',
          status: 'scheduled',
          scheduledAt: new Date('2026-09-12T06:00:00Z'),
          plannedAt: new Date('2026-09-11T06:00:00Z'),
        },
        {
          ...base,
          id: 'pub',
          status: 'published',
          publishedAt: new Date('2026-09-05T22:30:00Z'),
          plannedAt: new Date('2026-09-02T06:00:00Z'),
        },
        { ...base, id: 'outside', plannedAt: new Date('2026-11-01T06:00:00Z') },
      ],
      range,
    );
    expect(events.map((e) => `${e.article.id}:${e.kind}:${e.day}`)).toEqual([
      'pub:published:2026-09-06',
      'draft:deadline:2026-09-09',
      'draft:planned:2026-09-10',
      'sched:scheduled:2026-09-12',
    ]);
    const byDay = groupEventsByDay(events);
    expect(byDay.get('2026-09-09')!.map((e) => e.kind)).toEqual(['deadline']);
  });
});

describe('listPlanArticles / listPlanAttention', () => {
  it('returns articles with dates in range, scoped for contributors', async () => {
    const now = new Date('2026-09-06T10:00:00Z');
    await insertArticle({ title: 'Planlagt', plannedAt: new Date('2026-09-10T08:00:00Z') });
    await insertArticle({
      title: 'Frist',
      deadlineAt: new Date('2026-09-20T08:00:00Z'),
      createdBy: seed.contributor.id,
    });
    await insertArticle({
      title: 'Publisert',
      status: 'published',
      publishedAt: new Date('2026-09-03T08:00:00Z'),
    });
    await insertArticle({
      title: 'Arkivert',
      status: 'archived',
      plannedAt: new Date('2026-09-11T08:00:00Z'),
    });
    await insertArticle({ title: 'Utenfor', plannedAt: new Date('2026-10-11T08:00:00Z') });
    await insertArticle({ title: 'Slettet', plannedAt: new Date('2026-09-11T08:00:00Z'), deletedAt: now });

    const range = planRange('month', now, now);
    const all = await listPlanArticles(editor(), range);
    expect(all.map((a) => a.title).sort()).toEqual(['Frist', 'Planlagt', 'Publisert']);
    const own = await listPlanArticles(contributor(), range);
    expect(own.map((a) => a.title)).toEqual(['Frist']);
  });

  it('lists overdue, unassigned and undated open stories', async () => {
    const now = new Date('2026-09-06T10:00:00Z');
    await insertArticle({
      title: 'Forsinket',
      deadlineAt: new Date('2026-09-01T08:00:00Z'),
      assignedTo: seed.journalist.id,
    });
    await insertArticle({
      title: 'Publisert forsinket',
      status: 'published',
      deadlineAt: new Date('2026-09-01T08:00:00Z'),
    });
    await insertArticle({
      title: 'Uten eier',
      plannedAt: new Date('2026-09-12T08:00:00Z'),
      assignedTo: null,
    });
    await insertArticle({ title: 'Uten dato', assignedTo: seed.journalist.id });
    const attention = await listPlanAttention(editor(), now);
    expect(attention.overdue.map((a) => a.title)).toEqual(['Forsinket']);
    expect(attention.unassigned.map((a) => a.title)).toEqual(['Uten eier']);
    expect(attention.undated.map((a) => a.title)).toEqual(['Uten dato']);
  });
});

describe('updatePlanning', () => {
  it('patches only the keys that were sent, audits and notifies the new assignee', async () => {
    const a = await insertArticle({ title: 'Kommunestyret', deadlineAt: new Date('2026-09-20T10:00:00Z') });
    const raw = { id: a.id, assignedTo: seed.journalist.id };
    const patch = pickPlanningPatch(raw, planningPatchSchema.parse(raw));
    expect(patch).toEqual({ assignedTo: seed.journalist.id });
    const updated = await updatePlanning(editor(), a.id, patch);
    expect(updated.assignedTo).toBe(seed.journalist.id);
    expect(updated.deadlineAt?.toISOString()).toBe('2026-09-20T10:00:00.000Z');
    const notes = await db.select().from(notifications).where(eq(notifications.userId, seed.journalist.id));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('article.assigned');
    expect(notes[0]!.title).toContain('Kommunestyret');
    const log = await db.select().from(auditLog).where(eq(auditLog.action, 'article.plan'));
    expect(log).toHaveLength(1);
    expect(log[0]!.summary).toContain('tildelt');
  });

  it('moves a story and tells the assignee; clearing uses explicit nulls', async () => {
    const a = await insertArticle({
      title: 'Flytt meg',
      assignedTo: seed.journalist.id,
      plannedAt: new Date('2026-09-10T08:00:00Z'),
    });
    const moved = await updatePlanning(editor(), a.id, { plannedAt: new Date('2026-09-12T08:00:00Z') });
    expect(moved.plannedAt?.toISOString()).toBe('2026-09-12T08:00:00.000Z');
    expect(moved.assignedTo).toBe(seed.journalist.id);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, seed.journalist.id));
    expect(notes.map((n) => n.kind)).toEqual(['article.rescheduled']);

    const raw = { id: a.id, plannedAt: null, deadlineAt: '' };
    const cleared = await updatePlanning(
      editor(),
      a.id,
      pickPlanningPatch(raw, planningPatchSchema.parse(raw)),
    );
    expect(cleared.plannedAt).toBeNull();
    expect(cleared.deadlineAt).toBeNull();
  });

  it('enforces ownership for contributors and membership for assignees', async () => {
    const own = await insertArticle({ title: 'Egen', createdBy: seed.contributor.id });
    const other = await insertArticle({ title: 'Andres' });
    await expect(updatePlanning(contributor(), other.id, { plannedAt: new Date() })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const ok = await updatePlanning(contributor(), own.id, { plannedAt: new Date('2026-09-15T08:00:00Z') });
    expect(ok.plannedAt).not.toBeNull();
    await expect(
      updatePlanning(editor(), own.id, { assignedTo: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
