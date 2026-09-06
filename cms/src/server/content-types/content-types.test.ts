import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { articles, auditLog, contentTypes, type MemberRole, type User } from '@/db/schema';
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

import { listContentTypesWithCounts, safeFields } from './queries';
import { createContentType, deleteContentType, setDefaultContentType, updateContentType } from './service';

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
const journalist = () => ctxFor(seed.journalist, 'journalist');

const eventFields = [
  { key: 'starts_at', label: 'Starter', type: 'datetime', required: true },
  { key: 'venue', label: 'Sted', type: 'text' },
  { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'konsert', label: 'Konsert' }] },
];

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('content types', () => {
  it('requires content_type:manage', async () => {
    await expect(
      createContentType(journalist(), { key: 'event', name: 'Arrangement' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('creates a type with validated fields and audits', async () => {
    const created = await createContentType(editor(), {
      key: 'Event',
      name: 'Arrangement',
      template: 'article',
      fields: eventFields,
    });
    expect(created.key).toBe('event');
    expect(created.isDefault).toBe(false);
    expect(created.fields.map((f) => f.key)).toEqual(['starts_at', 'venue', 'kind']);
    expect(created.fields[0]).toMatchObject({ required: true, showInList: false });
    const log = await db.select().from(auditLog).where(eq(auditLog.action, 'content_type.create'));
    expect(log[0]!.summary).toContain('Arrangement');
  });

  it('rejects duplicate keys, duplicate field keys and select fields without options', async () => {
    await expect(createContentType(editor(), { key: 'article', name: 'Dobbel' })).rejects.toMatchObject({
      fieldErrors: { key: ['Nøkkelen er allerede i bruk'] },
    });
    await expect(
      createContentType(editor(), {
        key: 'x',
        name: 'X',
        fields: [
          { key: 'a', label: 'A', type: 'text' },
          { key: 'a', label: 'A igjen', type: 'text' },
        ],
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    await expect(
      createContentType(editor(), {
        key: 'y',
        name: 'Y',
        fields: [{ key: 'sel', label: 'Valg', type: 'select' }],
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
  });

  it('keeps exactly one default type', async () => {
    const created = await createContentType(editor(), {
      key: 'longread',
      name: 'Langlesing',
      template: 'longread',
      isDefault: true,
    });
    let list = await listContentTypesWithCounts(seed.site.id);
    expect(list.filter((c) => c.isDefault).map((c) => c.key)).toEqual(['longread']);

    // The only default cannot be un-defaulted.
    await expect(
      updateContentType(editor(), created.id, {
        key: 'longread',
        name: 'Langlesing',
        template: 'longread',
        isDefault: false,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    // …nor deactivated.
    await expect(
      updateContentType(editor(), created.id, {
        key: 'longread',
        name: 'Langlesing',
        template: 'longread',
        isDefault: true,
        isActive: false,
      }),
    ).rejects.toMatchObject({ code: 'validation' });

    await setDefaultContentType(editor(), seed.contentTypes.article.id);
    list = await listContentTypesWithCounts(seed.site.id);
    expect(list.filter((c) => c.isDefault).map((c) => c.key)).toEqual(['article']);
  });

  it('never changes the key on update', async () => {
    const updated = await updateContentType(editor(), seed.contentTypes.notice.id, {
      key: 'something-else',
      name: 'Notis (kort)',
      template: 'notice',
      fields: [{ key: 'source', label: 'Kilde', type: 'text', showInList: true }],
    });
    expect(updated.key).toBe('notice');
    expect(updated.name).toBe('Notis (kort)');
    expect(updated.fields[0]!.showInList).toBe(true);
  });

  it('refuses to delete a type with articles or the default type', async () => {
    await db.insert(articles).values({
      siteId: seed.site.id,
      contentTypeId: seed.contentTypes.notice.id,
      title: 'Notis',
      slug: 'notis',
      createdBy: seed.journalist.id,
    });
    await expect(deleteContentType(editor(), seed.contentTypes.notice.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(deleteContentType(editor(), seed.contentTypes.article.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    await deleteContentType(editor(), seed.contentTypes.opinion.id);
    const rows = await db.select().from(contentTypes).where(eq(contentTypes.siteId, seed.site.id));
    expect(rows.map((c) => c.key).sort()).toEqual(['article', 'notice']);
  });

  it('lists with article and field counts and tolerates broken field JSON', async () => {
    await db.insert(articles).values({
      siteId: seed.site.id,
      contentTypeId: seed.contentTypes.opinion.id,
      title: 'Leder',
      slug: 'leder',
      createdBy: seed.journalist.id,
    });
    const list = await listContentTypesWithCounts(seed.site.id);
    const opinion = list.find((c) => c.key === 'opinion')!;
    expect(opinion.articleCount).toBe(1);
    expect(opinion.fieldCount).toBe(1);
    expect(
      safeFields([{ key: 'ok', label: 'Ok', type: 'text' }, { key: 'BAD KEY', label: '', type: 'nope' }, 42]),
    ).toHaveLength(1);
  });
});
