/**
 * `pnpm db:reset --yes` — drop every table, enum type and the drizzle
 * migrations schema in the configured database, then migrate and seed from
 * scratch. Refuses to run without `--yes` because it destroys data.
 *
 * Only the database named by DATABASE_URL (or the PGlite directory in
 * PGLITE_DIR) is touched. Local upload files belonging to media rows are
 * removed before the tables go, so `UPLOAD_DIR` does not fill up with
 * orphans.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadEnvFiles } from './env-file';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.includes('--yes') && !args.includes('-y')) {
    console.error('[reset] Dette sletter ALT innhold i databasen. Kjør på nytt med --yes for å bekrefte.');
    process.exit(2);
  }
  const loaded = loadEnvFiles();
  if (loaded.length) console.info(`[reset] Leste miljø fra ${loaded.join(', ')}.`);

  const { env } = await import('@/env');
  const { sql } = await import('drizzle-orm');
  const { getDb, dbDriver, closeDb } = await import('@/db');
  const { media } = await import('@/db/schema');
  const { runMigrations } = await import('@/db/migrate');
  const { runSeed, printSeedSummary } = await import('./seed/run');

  const target = env.DATABASE_URL
    ? env.DATABASE_URL.replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@')
    : `PGlite (${env.PGLITE_DIR})`;
  console.info(`[reset] Nullstiller ${target}`);

  const db = await getDb();
  const driver = dbDriver() ?? (env.DATABASE_URL ? 'postgres' : 'pglite');

  /* Remove local files for media rows (best effort; the table may not exist yet). */
  if (env.STORAGE_DRIVER === 'local') {
    try {
      const rows = await db.select({ storageKey: media.storageKey, variants: media.variants }).from(media);
      let removed = 0;
      for (const row of rows) {
        const keys = [row.storageKey, ...Object.values(row.variants ?? {}).map((v) => v.key)];
        for (const key of keys) {
          await fs.rm(path.resolve(env.UPLOAD_DIR, key), { force: true }).then(
            () => removed++,
            () => {},
          );
        }
      }
      if (removed) console.info(`[reset] Slettet ${removed} fil(er) fra ${env.UPLOAD_DIR}.`);
    } catch {
      /* no media table yet */
    }
  }

  /* Drop tables, then enum types, then drizzle's bookkeeping schema. */
  const tableRows = await db
    .select({ name: sql<string>`tablename` })
    .from(sql`pg_tables`)
    .where(sql`schemaname = 'public'`);
  for (const t of tableRows) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "public"."${t.name.replace(/"/g, '""')}" CASCADE`));
  }
  const typeRows = await db
    .select({ name: sql<string>`t.typname` })
    .from(sql`pg_type t join pg_namespace n on n.oid = t.typnamespace`)
    .where(sql`n.nspname = 'public' and t.typtype = 'e'`);
  for (const t of typeRows) {
    await db.execute(sql.raw(`DROP TYPE IF EXISTS "public"."${t.name.replace(/"/g, '""')}" CASCADE`));
  }
  await db.execute(sql`DROP SCHEMA IF EXISTS "drizzle" CASCADE`);
  console.info(`[reset] Slettet ${tableRows.length} tabell(er) og ${typeRows.length} type(r).`);

  await runMigrations(db, driver);
  const summary = await runSeed({ force: true });
  await closeDb();
  if (summary) printSeedSummary(summary);
}

main().catch((err: unknown) => {
  console.error('[reset] Nullstilling feilet:', err);
  process.exit(1);
});
