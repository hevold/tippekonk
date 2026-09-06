import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articleViews, articles, auditLog, notifications, type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { activityIcon, describeActivity, quotedTitle } from './activity';
import { getDashboardData, getDashboardStats, listActivity, listMostRead, listUpcoming } from './queries';

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

// Sunday 6 September 2026, 12:00 in Oslo (10:00 UTC).
const NOW = new Date('2026-09-06T10:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const hoursAhead = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

async function insertArticle(spec: Partial<typeof articles.$inferInsert> & { title: string }) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      sectionId: seed.section.id,
      slug: spec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + Math.random().toString(36).slice(2, 6),
      createdBy: seed.journalist.id,
      updatedBy: seed.journalist.id,
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

describe('describeActivity', () => {
  it('turns audit rows into Norwegian sentences', () => {
    const base = { entityType: 'article', entityId: null, data: null };
    expect(
      describeActivity(
        { ...base, action: 'article.publish', summary: 'Publiserte «Budsjettet»' },
        'Ingrid Haugen',
      ),
    ).toBe('Ingrid Haugen publiserte «Budsjettet»');
    expect(
      describeActivity(
        {
          ...base,
          action: 'article.transition',
          summary: '«Sak»: draft → in_review',
          data: { to: 'in_review' },
        },
        'Ola',
      ),
    ).toBe('Ola satte «Sak» til til desk');
    expect(describeActivity({ ...base, action: 'tag.merge', summary: 'Slo sammen «A» med «B»' }, null)).toBe(
      'Systemet slo sammen stikkord',
    );
    expect(describeActivity({ ...base, action: 'something.new', summary: 'Gjorde noe' }, 'Kari')).toBe(
      'Kari: Gjorde noe',
    );
    expect(quotedTitle('Opprettet «Tittel med «indre» tegn»')).toBe('«Tittel med «indre»');
    expect(activityIcon('article.publish')).toBe('publish');
    expect(activityIcon('section.create')).toBe('taxonomy');
    expect(activityIcon('weird')).toBe('other');
  });
});

describe('dashboard queries', () => {
  it('computes stats for today, this week, statuses, overdue and views', async () => {
    await insertArticle({ title: 'I dag', status: 'published', publishedAt: hoursAgo(2) });
    await insertArticle({ title: 'Denne uka', status: 'published', publishedAt: hoursAgo(5 * 24) }); // Tuesday
    await insertArticle({ title: 'Forrige uke', status: 'published', publishedAt: hoursAgo(8 * 24) });
    await insertArticle({ title: 'Utkast', status: 'draft' });
    await insertArticle({ title: 'Forsinket', status: 'in_review', deadlineAt: hoursAgo(1) });
    const viewed = await insertArticle({ title: 'Lest', status: 'published', publishedAt: hoursAgo(48) });
    await db.insert(articleViews).values([
      { articleId: viewed.id, day: '2026-09-05', views: 40 },
      { articleId: viewed.id, day: '2026-08-01', views: 999 },
    ]);
    const stats = await getDashboardStats(editor(), NOW);
    expect(stats).toMatchObject({
      publishedToday: 1,
      publishedThisWeek: 3,
      drafts: 1,
      inReview: 1,
      overdue: 1,
      viewsLast7Days: 40,
    });
    const mostRead = await listMostRead(editor(), NOW);
    expect(mostRead.map((m) => [m.title, m.views])).toEqual([['Lest', 40]]);
  });

  it('lists upcoming scheduled, planned and deadline items in the next 7 days', async () => {
    await insertArticle({ title: 'Planlagt publisering', status: 'scheduled', scheduledAt: hoursAhead(30) });
    await insertArticle({ title: 'I planen', status: 'draft', plannedAt: hoursAhead(50) });
    await insertArticle({ title: 'Frist snart', status: 'draft', deadlineAt: hoursAhead(5) });
    await insertArticle({ title: 'Langt fram', status: 'draft', plannedAt: hoursAhead(24 * 20) });
    await insertArticle({
      title: 'Allerede publisert',
      status: 'published',
      publishedAt: hoursAgo(1),
      plannedAt: hoursAhead(3),
    });
    const upcoming = await listUpcoming(editor(), NOW);
    expect(upcoming.map((u) => `${u.title}:${u.kind}`)).toEqual([
      'Frist snart:deadline',
      'Planlagt publisering:scheduled',
      'I planen:planned',
    ]);
  });

  it('assembles the dashboard with scoping and the review queue only for reviewers', async () => {
    await insertArticle({ title: 'Til desk', status: 'in_review', updatedAt: hoursAgo(3) });
    await insertArticle({ title: 'Min sak', status: 'draft', assignedTo: seed.editor.id });
    await insertArticle({
      title: 'Frilansens',
      status: 'draft',
      createdBy: seed.contributor.id,
      assignedTo: seed.contributor.id,
    });
    await db.insert(auditLog).values({
      siteId: seed.site.id,
      userId: seed.journalist.id,
      action: 'article.create',
      entityType: 'article',
      summary: 'Opprettet «Til desk»',
    });
    await db
      .insert(notifications)
      .values({ userId: seed.editor.id, siteId: seed.site.id, kind: 'x', title: 'Hei' });

    const data = await getDashboardData(editor(), NOW);
    expect(data.reviewQueue?.map((a) => a.title)).toEqual(['Til desk']);
    expect(data.myArticles.map((a) => a.title)).toEqual(['Min sak']);
    expect(data.activity[0]!.text).toBe(`${seed.journalist.name} opprettet «Til desk»`);
    expect(data.unreadCount).toBe(1);
    expect(data.unreadNotifications[0]!.title).toBe('Hei');

    const own = await getDashboardData(contributor(), NOW);
    expect(own.reviewQueue).toBeNull();
    expect(own.myArticles.map((a) => a.title)).toEqual(['Frilansens']);
    expect(own.activity).toEqual([]);
    expect(own.stats.drafts).toBe(1);

    const feed = await listActivity(editor(), 5);
    expect(feed).toHaveLength(1);
  });
});
