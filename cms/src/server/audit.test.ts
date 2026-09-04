import { desc } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog } from '@/db/schema';
import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

import { audit, auditFromContext } from './audit';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('audit', () => {
  it('inserts a row with actor, site, entity, summary, data and ip', async () => {
    await audit(
      { user: seed.editor, site: seed.site, ip: '127.0.0.1' },
      {
        action: 'article.publish',
        entityType: 'article',
        entityId: seed.section.id,
        summary: 'Publiserte «Test»',
        data: { version: 3 },
      },
    );
    const [row] = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(1);
    expect(row).toMatchObject({
      action: 'article.publish',
      userId: seed.editor.id,
      siteId: seed.site.id,
      entityType: 'article',
      entityId: seed.section.id,
      summary: 'Publiserte «Test»',
      data: { version: 3 },
      ip: '127.0.0.1',
    });
  });

  it('tolerates anonymous actors, non-uuid entity ids and never throws', async () => {
    await audit({}, { action: 'auth.login_failed', entityId: 'not-a-uuid' });
    await auditFromContext({ user: seed.admin, site: seed.site, ip: null }, { action: 'settings.update' });
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.action === 'auth.login_failed')).toMatchObject({
      userId: null,
      siteId: null,
      entityId: null,
    });
    expect(rows.find((r) => r.action === 'settings.update')).toMatchObject({
      userId: seed.admin.id,
      siteId: seed.site.id,
    });
  });
});
