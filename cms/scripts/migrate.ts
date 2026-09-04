/**
 * `pnpm db:migrate` — apply pending migrations from ./drizzle to the
 * configured database (DATABASE_URL, or the embedded PGlite in PGLITE_DIR).
 *
 * Loads .env.local/.env first, then imports the app modules dynamically so
 * that `@/env` sees the loaded variables. No top-level await (CJS + tsx).
 */
import { loadEnvFiles } from './env-file';

async function main(): Promise<void> {
  const loaded = loadEnvFiles();
  if (loaded.length) console.info(`[db] Leste miljø fra ${loaded.join(', ')}.`);

  const { env } = await import('@/env');
  const { getDb, dbDriver, closeDb } = await import('@/db');
  const { runMigrations, migrationsFolder } = await import('@/db/migrate');

  const target = env.DATABASE_URL
    ? env.DATABASE_URL.replace(/:\/\/([^:@/]+):[^@]*@/, '://$1:***@')
    : `PGlite (${env.PGLITE_DIR})`;
  console.info(`[db] Migrerer ${target} fra ${migrationsFolder()}`);

  const db = await getDb();
  const driver = dbDriver() ?? (env.DATABASE_URL ? 'postgres' : 'pglite');
  const result = await runMigrations(db, driver);
  await closeDb();
  console.info(`[db] Ferdig: ${result.applied} ny(e), ${result.total} totalt.`);
}

main().catch((err: unknown) => {
  console.error('[db] Migrering feilet:', err);
  process.exit(1);
});
