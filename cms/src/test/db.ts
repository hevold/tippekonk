/**
 * Test database helpers.
 *
 *   const db = await useTestDb();          // in-memory PGlite, migrated, registered with setDb()
 *   const seeded = await seedMinimal(db);  // site 'test' + users + taxonomy
 *   await resetTestDb();                   // truncate everything between tests
 *
 * Each vitest worker (pool: 'forks') gets its own process and therefore its
 * own PGlite instance, so tests never share state across files.
 */
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';

import { closeDb, dbDriver, getDb, setDb, type Db } from '@/db';
import { runMigrations } from '@/db/migrate';
import {
  authors,
  contentTypes,
  memberships,
  sections,
  sites,
  tags,
  users,
  type Author,
  type ContentType,
  type Section,
  type Site,
  type Tag,
  type User,
} from '@/db/schema';

export const TEST_PASSWORD = 'Test1234!';

let testClient: { close(): Promise<void> } | null = null;
let testDb: Db | null = null;

/**
 * Create (once per process) an in-memory PGlite database with all migrations
 * applied and register it as the active `db`.
 */
export async function useTestDb(): Promise<Db> {
  if (testDb) {
    setDb(testDb, 'pglite');
    return testDb;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const schema = await import('@/db/schema');
  const client = new PGlite();
  await client.waitReady;
  const instance = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db;
  await runMigrations(instance, 'pglite', { quiet: true });
  testClient = client;
  testDb = instance;
  setDb(instance, 'pglite');
  return instance;
}

/** Close the in-memory database (called from the global test setup). */
export async function closeTestDb(): Promise<void> {
  const client = testClient;
  testClient = null;
  testDb = null;
  setDb(null);
  if (client) await client.close();
}

/** Truncate every table in the public schema (identity restarted, cascading). */
export async function resetTestDb(): Promise<void> {
  const db = testDb ?? (dbDriver() ? await getDb() : null);
  if (!db) return;
  const rows = await db
    .select({ name: sql<string>`tablename` })
    .from(sql`pg_tables`)
    .where(sql`schemaname = 'public'`);
  const names = rows.map((r) => `"${r.name.replace(/"/g, '""')}"`);
  if (names.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY CASCADE`));
}

export type SeededUsers = {
  admin: User;
  editor: User;
  journalist: User;
  contributor: User;
};

export type SeedMinimalResult = SeededUsers & {
  site: Site;
  /** The default content type ('article'). */
  contentType: ContentType;
  contentTypes: { article: ContentType; opinion: ContentType; notice: ContentType };
  /** The 'nyheter' section. */
  section: Section;
  sections: { nyheter: Section; sport: Section };
  tags: Tag[];
  authors: { admin: Author; editor: Author; journalist: Author; contributor: Author };
  /** Plain-text password shared by all seeded users. */
  password: string;
};

let cachedPasswordHash: string | null = null;
async function testPasswordHash(): Promise<string> {
  cachedPasswordHash ??= await hash(TEST_PASSWORD);
  return cachedPasswordHash;
}

/**
 * Seed the smallest realistic newsroom: one site ('test', domains
 * ['localhost']), four users with memberships, the three default content
 * types, two sections, two tags and an author per user.
 */
export async function seedMinimal(db: Db): Promise<SeedMinimalResult> {
  const passwordHash = await testPasswordHash();

  const [site] = await db
    .insert(sites)
    .values({
      slug: 'test',
      name: 'Testavisen',
      tagline: 'Testavis for automatiske tester',
      domains: ['localhost'],
      settings: {} as Site['settings'],
    })
    .returning();
  if (!site) throw new Error('seedMinimal: could not insert site');

  const userSpecs = [
    { key: 'admin', email: 'admin@test.local', name: 'Anne Admin', role: 'admin', isSuperadmin: true },
    { key: 'editor', email: 'editor@test.local', name: 'Erik Redaktør', role: 'editor', isSuperadmin: false },
    {
      key: 'journalist',
      email: 'journalist@test.local',
      name: 'Julie Journalist',
      role: 'journalist',
      isSuperadmin: false,
    },
    {
      key: 'contributor',
      email: 'contributor@test.local',
      name: 'Frida Frilans',
      role: 'contributor',
      isSuperadmin: false,
    },
  ] as const;

  const insertedUsers = await db
    .insert(users)
    .values(
      userSpecs.map((u) => ({
        email: u.email,
        name: u.name,
        passwordHash,
        isSuperadmin: u.isSuperadmin,
        emailVerifiedAt: new Date(),
      })),
    )
    .returning();
  const byEmail = new Map(insertedUsers.map((u) => [u.email, u]));
  const pick = (key: (typeof userSpecs)[number]['key']): User => {
    const spec = userSpecs.find((u) => u.key === key)!;
    const user = byEmail.get(spec.email);
    if (!user) throw new Error(`seedMinimal: missing user ${key}`);
    return user;
  };
  const seededUsers: SeededUsers = {
    admin: pick('admin'),
    editor: pick('editor'),
    journalist: pick('journalist'),
    contributor: pick('contributor'),
  };

  await db
    .insert(memberships)
    .values(userSpecs.map((u) => ({ userId: pick(u.key).id, siteId: site.id, role: u.role })));

  const insertedTypes = await db
    .insert(contentTypes)
    .values([
      {
        siteId: site.id,
        key: 'article',
        name: 'Artikkel',
        template: 'article',
        isDefault: true,
        sortOrder: 0,
        icon: 'FileText',
      },
      {
        siteId: site.id,
        key: 'opinion',
        name: 'Kommentar',
        template: 'opinion',
        sortOrder: 1,
        icon: 'MessageSquareQuote',
        fields: [
          {
            key: 'standpoint',
            label: 'Standpunkt',
            type: 'select',
            required: false,
            showInList: false,
            options: [
              { value: 'leder', label: 'Leder' },
              { value: 'kommentar', label: 'Kommentar' },
              { value: 'debatt', label: 'Debattinnlegg' },
            ],
          },
        ],
      },
      { siteId: site.id, key: 'notice', name: 'Notis', template: 'notice', sortOrder: 2, icon: 'StickyNote' },
    ])
    .returning();
  const typeByKey = (key: string): ContentType => {
    const ct = insertedTypes.find((c) => c.key === key);
    if (!ct) throw new Error(`seedMinimal: missing content type ${key}`);
    return ct;
  };

  const insertedSections = await db
    .insert(sections)
    .values([
      { siteId: site.id, name: 'Nyheter', slug: 'nyheter', sortOrder: 0, color: '#0b3d91' },
      { siteId: site.id, name: 'Sport', slug: 'sport', sortOrder: 1, color: '#1b7f3b' },
    ])
    .returning();
  const sectionBySlug = (slug: string): Section => {
    const s = insertedSections.find((x) => x.slug === slug);
    if (!s) throw new Error(`seedMinimal: missing section ${slug}`);
    return s;
  };

  const insertedTags = await db
    .insert(tags)
    .values([
      { siteId: site.id, name: 'Kommunestyret', slug: 'kommunestyret' },
      { siteId: site.id, name: 'Fotball', slug: 'fotball' },
    ])
    .returning();

  const authorSpecs: { key: keyof SeededUsers; slug: string; title: string }[] = [
    { key: 'admin', slug: 'anne-admin', title: 'Ansvarlig redaktør' },
    { key: 'editor', slug: 'erik-redaktor', title: 'Vaktsjef' },
    { key: 'journalist', slug: 'julie-journalist', title: 'Journalist' },
    { key: 'contributor', slug: 'frida-frilans', title: 'Frilansjournalist' },
  ];
  const insertedAuthors = await db
    .insert(authors)
    .values(
      authorSpecs.map((a, i) => ({
        siteId: site.id,
        userId: seededUsers[a.key].id,
        name: seededUsers[a.key].name,
        slug: a.slug,
        title: a.title,
        email: seededUsers[a.key].email,
        sortOrder: i,
      })),
    )
    .returning();
  const authorFor = (key: keyof SeededUsers): Author => {
    const a = insertedAuthors.find((x) => x.userId === seededUsers[key].id);
    if (!a) throw new Error(`seedMinimal: missing author for ${key}`);
    return a;
  };

  return {
    ...seededUsers,
    site,
    contentType: typeByKey('article'),
    contentTypes: {
      article: typeByKey('article'),
      opinion: typeByKey('opinion'),
      notice: typeByKey('notice'),
    },
    section: sectionBySlug('nyheter'),
    sections: { nyheter: sectionBySlug('nyheter'), sport: sectionBySlug('sport') },
    tags: insertedTags,
    authors: {
      admin: authorFor('admin'),
      editor: authorFor('editor'),
      journalist: authorFor('journalist'),
      contributor: authorFor('contributor'),
    },
    password: TEST_PASSWORD,
  };
}

/** Close whatever database is active (test DB first, then the global holder). */
export async function teardownTestDb(): Promise<void> {
  await closeTestDb();
  await closeDb().catch(() => {});
}
