/**
 * Audit log viewer: summaries and entity links (pure) plus filtered listing.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { auditLog } from '@/db/schema';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  auditEntityLink,
  auditLogFilterSchema,
  auditTone,
  describeAuditEntry,
  listAuditFacets,
  listAuditLog,
  listAuditUsers,
} from './audit-log';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('describeAuditEntry', () => {
  it('prefers the stored summary and otherwise derives Norwegian text from the action', () => {
    expect(
      describeAuditEntry({
        action: 'article.publish',
        summary: 'Publiserte «X»',
        entityType: 'article',
        entityId: null,
      }),
    ).toBe('Publiserte «X»');
    expect(
      describeAuditEntry({ action: 'article.publish', summary: null, entityType: 'article', entityId: null }),
    ).toBe('Publiserte sak');
    expect(
      describeAuditEntry({
        action: 'settings.update',
        summary: '',
        entityType: 'site',
        entityId: '4b3d9a8e-1d6f-4d2f-9c5b-2b3f0d3f4e11',
      }),
    ).toBe('Endret innstillinger 4b3d9a8e');
    expect(
      describeAuditEntry({ action: 'weird.thing', summary: null, entityType: null, entityId: null }),
    ).toBe('weird.thing');
  });

  it('links entities the admin can open and never deleted ones', () => {
    const id = '4b3d9a8e-1d6f-4d2f-9c5b-2b3f0d3f4e11';
    expect(auditEntityLink({ action: 'article.update', entityType: 'article', entityId: id })).toBe(
      `/admin/artikler/${id}`,
    );
    expect(auditEntityLink({ action: 'article.delete', entityType: 'article', entityId: id })).toBeNull();
    expect(auditEntityLink({ action: 'media.update', entityType: 'media', entityId: id })).toBe(
      `/admin/media/${id}`,
    );
    expect(auditEntityLink({ action: 'redirect.create', entityType: 'redirect', entityId: id })).toBe(
      '/admin/innstillinger/omdirigeringer',
    );
    expect(auditEntityLink({ action: 'auth.login', entityType: null, entityId: null })).toBeNull();
    expect(auditTone('article.delete')).toBe('danger');
    expect(auditTone('article.publish')).toBe('success');
    expect(auditTone('article.unpublish')).toBe('warning');
    expect(auditTone('settings.update')).toBe('default');
  });
});

describe('listAuditLog', () => {
  it('filters by user, action prefix, entity type, dates and text; paginates', async () => {
    const old = new Date('2024-01-01T10:00:00Z');
    await db.insert(auditLog).values([
      {
        siteId: seed.site.id,
        userId: seed.admin.id,
        action: 'article.publish',
        entityType: 'article',
        summary: 'Publiserte «Budsjett»',
      },
      {
        siteId: seed.site.id,
        userId: seed.editor.id,
        action: 'article.update',
        entityType: 'article',
        summary: 'Endret «Budsjett»',
      },
      {
        siteId: seed.site.id,
        userId: seed.editor.id,
        action: 'settings.update',
        entityType: 'site',
        summary: 'Endret tema',
        createdAt: old,
      },
      {
        siteId: null,
        userId: seed.admin.id,
        action: 'site.delete',
        entityType: 'site',
        summary: 'Slettet nettsted',
      },
    ]);

    const all = await listAuditLog(seed.site.id);
    expect(all.total).toBe(3);
    expect(all.items[0]?.user?.name).toBeDefined();

    expect((await listAuditLog(seed.site.id, {}, { includeGlobal: true })).total).toBe(4);
    expect((await listAuditLog(seed.site.id, { userId: seed.editor.id })).total).toBe(2);
    expect((await listAuditLog(seed.site.id, { action: 'article' })).total).toBe(2);
    expect((await listAuditLog(seed.site.id, { action: 'article.publish' })).total).toBe(1);
    expect((await listAuditLog(seed.site.id, { entityType: 'site' })).total).toBe(1);
    expect((await listAuditLog(seed.site.id, { to: '2024-06-01' })).total).toBe(1);
    expect((await listAuditLog(seed.site.id, { from: '2024-06-01' })).total).toBe(2);
    expect((await listAuditLog(seed.site.id, { q: 'budsjett' })).total).toBe(2);

    const page2 = await listAuditLog(seed.site.id, { perPage: 2, page: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);

    const users = await listAuditUsers(seed.site.id);
    expect(users.map((u) => u.id).sort()).toEqual([seed.admin.id, seed.editor.id].sort());
    const facets = await listAuditFacets(seed.site.id);
    expect(facets.actionPrefixes).toEqual(['article', 'settings']);
    expect(facets.entityTypes).toEqual(['article', 'site']);
  });

  it('rejects malformed filters', () => {
    expect(auditLogFilterSchema.safeParse({ action: 'article; drop' }).success).toBe(false);
    expect(auditLogFilterSchema.safeParse({ userId: 'nope' }).success).toBe(false);
    expect(auditLogFilterSchema.parse({ userId: '', from: '' })).toMatchObject({ page: 1, perPage: 50 });
  });
});
