import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { articleViews } from '@/db/schema';
import type { Db } from '@/db';
import { resetRateLimits } from '@/server/rate-limit';
import { seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { beaconAllowed, beaconSchema, osloDay, recordPageview } from './beacon';
import { seedNewsroom, type Newsroom } from './test-fixtures';

let db: Db;
let seeded: SeedMinimalResult;
let fx: Newsroom;

beforeAll(async () => {
  db = await useTestDb();
  seeded = await seedMinimal(db);
  fx = await seedNewsroom(db, seeded);
  resetRateLimits();
});

describe('beacon', () => {
  it('validates the payload', () => {
    expect(beaconSchema.safeParse({ articleId: fx.ids.skole }).success).toBe(true);
    expect(beaconSchema.safeParse({ articleId: 'nope' }).success).toBe(false);
    expect(beaconSchema.safeParse(null).success).toBe(false);
  });

  it('computes the Oslo calendar day', () => {
    // 23:30 UTC on 3 Sept is 01:30 on 4 Sept in Oslo (CEST).
    expect(osloDay(new Date('2026-09-03T23:30:00Z'))).toBe('2026-09-04');
    expect(osloDay(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15');
  });

  it('upserts one row per article and day', async () => {
    const day = '2026-09-04';
    expect(await recordPageview(seeded.site.id, fx.ids.skole, day)).toBe(true);
    expect(await recordPageview(seeded.site.id, fx.ids.skole, day)).toBe(true);
    expect(await recordPageview(seeded.site.id, fx.ids.skole, '2026-09-05')).toBe(true);
    const rows = await db.select().from(articleViews).where(eq(articleViews.articleId, fx.ids.skole));
    const byDay = Object.fromEntries(rows.map((r) => [r.day, r.views]));
    expect(byDay[day]).toBe(2);
    expect(byDay['2026-09-05']).toBe(1);
  });

  it('ignores unpublished, trashed, future and foreign articles', async () => {
    expect(await recordPageview(seeded.site.id, fx.ids.utkast, '2026-09-04')).toBe(false);
    expect(await recordPageview(seeded.site.id, fx.ids.slettet, '2026-09-04')).toBe(false);
    expect(await recordPageview(seeded.site.id, fx.ids.planlagt, '2026-09-04')).toBe(false);
    expect(await recordPageview('00000000-0000-0000-0000-000000000000', fx.ids.skole, '2026-09-04')).toBe(
      false,
    );
    const rows = await db.select().from(articleViews).where(eq(articleViews.articleId, fx.ids.utkast));
    expect(rows).toHaveLength(0);
  });

  it('rate-limits one hit per ip+article per minute', () => {
    const t0 = 1_000_000;
    expect(beaconAllowed('1.2.3.4', 'a', t0)).toBe(true);
    expect(beaconAllowed('1.2.3.4', 'a', t0 + 10_000)).toBe(false);
    expect(beaconAllowed('1.2.3.4', 'b', t0 + 10_000)).toBe(true);
    expect(beaconAllowed('5.6.7.8', 'a', t0 + 10_000)).toBe(true);
    expect(beaconAllowed('1.2.3.4', 'a', t0 + 61_000)).toBe(true);
  });
});
