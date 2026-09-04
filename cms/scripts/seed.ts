/**
 * `pnpm db:seed [--force]` — create the demo newsroom "Elvebyen Tidende"
 * (see docs/SPEC.md §10). Idempotent: if the site already exists the script
 * prints a notice and exits; `--force` deletes that site (cascade, including
 * its uploaded files and demo users) and seeds again.
 *
 * Loads .env.local/.env before importing app modules. No top-level await.
 */
import { loadEnvFiles } from './env-file';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const loaded = loadEnvFiles();
  if (loaded.length) console.info(`[seed] Leste miljø fra ${loaded.join(', ')}.`);

  const { runSeed, printSeedSummary } = await import('./seed/run');
  const { closeDb } = await import('@/db');

  const summary = await runSeed({ force });
  await closeDb();
  if (summary) printSeedSummary(summary);
}

main().catch((err: unknown) => {
  console.error('[seed] Seeding feilet:', err);
  process.exit(1);
});
