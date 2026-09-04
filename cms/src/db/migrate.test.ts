/**
 * Migrations apply cleanly to a fresh in-memory PGlite database, create the
 * full schema (27 tables + enums + generated search column) and are
 * idempotent on a second run.
 */
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Db } from '@/db';
import { migrationsFolder, runMigrations } from '@/db/migrate';
import * as schema from '@/db/schema';

const EXPECTED_TABLES = [
  'api_keys',
  'article_bylines',
  'article_notes',
  'article_related',
  'article_revisions',
  'article_tags',
  'article_views',
  'articles',
  'audit_log',
  'auth_tokens',
  'authors',
  'content_types',
  'layouts',
  'live_blogs',
  'live_posts',
  'media',
  'memberships',
  'menus',
  'notifications',
  'redirects',
  'sections',
  'sessions',
  'sites',
  'tags',
  'users',
  'webhook_deliveries',
  'webhooks',
];

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db;
});

afterAll(async () => {
  await client.close();
});

describe('runMigrations', () => {
  it('resolves the migrations folder relative to cwd', () => {
    expect(migrationsFolder().endsWith('drizzle')).toBe(true);
  });

  it('applies all migrations to an empty PGlite database', async () => {
    const result = await runMigrations(db, 'pglite', { quiet: true });
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(result.total).toBe(result.applied);

    const rows = await db
      .select({ name: sql<string>`tablename` })
      .from(sql`pg_tables`)
      .where(sql`schemaname = 'public'`);
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(EXPECTED_TABLES);
    expect(names).toHaveLength(27);
  });

  it('creates the enum types and the norwegian search vector', async () => {
    const enums = await db
      .select({ name: sql<string>`t.typname` })
      .from(sql`pg_type t join pg_namespace n on n.oid = t.typnamespace`)
      .where(sql`n.nspname = 'public' and t.typtype = 'e'`);
    expect(enums.map((e) => e.name).sort()).toEqual([
      'article_access',
      'article_status',
      'auth_token_kind',
      'byline_role',
      'live_blog_status',
      'media_kind',
      'member_role',
      'revision_kind',
    ]);

    const [site] = await db.insert(schema.sites).values({ slug: 's', name: 'S' }).returning();
    const [ct] = await db
      .insert(schema.contentTypes)
      .values({ siteId: site!.id, key: 'article', name: 'Artikkel', isDefault: true })
      .returning();
    await db.insert(schema.articles).values({
      siteId: site!.id,
      contentTypeId: ct!.id,
      title: 'Kommunestyret vedtok budsjettet',
      slug: 'kommunestyret-vedtok-budsjettet',
      bodyText: 'Svømmehallen kommer i 2028.',
    });
    const hits = await db
      .select({ title: schema.articles.title })
      .from(schema.articles)
      .where(sql`${schema.articles.search} @@ websearch_to_tsquery('norwegian', 'svømmehall')`);
    expect(hits.map((h) => h.title)).toEqual(['Kommunestyret vedtok budsjettet']);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const again = await runMigrations(db, 'pglite', { quiet: true });
    expect(again.applied).toBe(0);
    expect(again.total).toBeGreaterThanOrEqual(1);
  });
});
