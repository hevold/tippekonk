/**
 * The test helpers themselves: useTestDb() yields a migrated PGlite that is
 * registered as the global `db`, seedMinimal() returns the documented shape,
 * and resetTestDb() empties every table.
 */
import { verify } from '@node-rs/argon2';
import { count } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { db as globalDb, dbDriver, type Db } from '@/db';
import { articles, authors, contentTypes, memberships, sections, sites, tags, users } from '@/db/schema';
import { can } from '@/lib/permissions';

import { TEST_PASSWORD, resetTestDb, seedMinimal, useTestDb } from './db';

let db: Db;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('useTestDb', () => {
  it('registers the PGlite instance as the global db proxy', async () => {
    expect(dbDriver()).toBe('pglite');
    const [row] = await globalDb.select({ n: count() }).from(sites);
    expect(row?.n).toBe(0);
  });

  it('returns the same instance on repeated calls', async () => {
    expect(await useTestDb()).toBe(db);
  });
});

describe('seedMinimal', () => {
  it('creates the site, four users with memberships, content types, sections, tags and authors', async () => {
    const s = await seedMinimal(db);

    expect(s.site.slug).toBe('test');
    expect(s.site.domains).toEqual(['localhost']);
    expect(s.password).toBe(TEST_PASSWORD);

    expect(s.admin.isSuperadmin).toBe(true);
    expect(s.editor.isSuperadmin).toBe(false);
    for (const u of [s.admin, s.editor, s.journalist, s.contributor]) {
      expect(u.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await verify(u.passwordHash!, TEST_PASSWORD)).toBe(true);
    }

    const roles = await db.select().from(memberships);
    const roleFor = (userId: string) => roles.find((m) => m.userId === userId)?.role;
    expect(roleFor(s.admin.id)).toBe('admin');
    expect(roleFor(s.editor.id)).toBe('editor');
    expect(roleFor(s.journalist.id)).toBe('journalist');
    expect(roleFor(s.contributor.id)).toBe('contributor');
    expect(can(roleFor(s.journalist.id), 'article:publish')).toBe(false);
    expect(can(roleFor(s.editor.id), 'article:publish')).toBe(true);

    expect(s.contentType.key).toBe('article');
    expect(s.contentType.isDefault).toBe(true);
    expect(Object.keys(s.contentTypes).sort()).toEqual(['article', 'notice', 'opinion']);
    expect(s.contentTypes.opinion.fields[0]?.key).toBe('standpoint');

    expect(s.section.slug).toBe('nyheter');
    expect(s.sections.sport.slug).toBe('sport');
    expect(s.tags).toHaveLength(2);

    expect(s.authors.admin.userId).toBe(s.admin.id);
    expect(s.authors.journalist.name).toBe(s.journalist.name);
    expect(s.authors.contributor.siteId).toBe(s.site.id);

    const [userCount] = await db.select({ n: count() }).from(users);
    const [authorCount] = await db.select({ n: count() }).from(authors);
    const [typeCount] = await db.select({ n: count() }).from(contentTypes);
    const [sectionCount] = await db.select({ n: count() }).from(sections);
    const [tagCount] = await db.select({ n: count() }).from(tags);
    expect([userCount?.n, authorCount?.n, typeCount?.n, sectionCount?.n, tagCount?.n]).toEqual([
      4, 4, 3, 2, 2,
    ]);
  });

  it('produces rows usable for article inserts', async () => {
    const s = await seedMinimal(db);
    const [a] = await db
      .insert(articles)
      .values({
        siteId: s.site.id,
        contentTypeId: s.contentType.id,
        sectionId: s.section.id,
        title: 'Test',
        slug: 'test',
        createdBy: s.journalist.id,
      })
      .returning();
    expect(a?.status).toBe('draft');
    expect(a?.version).toBe(1);
  });
});

describe('resetTestDb', () => {
  it('truncates every table so a second seed succeeds', async () => {
    await seedMinimal(db);
    await resetTestDb();
    const [n] = await db.select({ n: count() }).from(users);
    expect(n?.n).toBe(0);
    const again = await seedMinimal(db);
    expect(again.site.slug).toBe('test');
  });
});
