/**
 * Next.js instrumentation hook — runs once when the server starts (Node.js
 * runtime only). Connects to the database, applies pending migrations when
 * AUTO_MIGRATE is on and starts the in-process scheduler when
 * ENABLE_INTERNAL_SCHEDULER is on.
 *
 * In development a failing migration must never take the dev server down:
 * the error is logged loudly and requests will fail with a clear message from
 * the lazy `db` proxy instead. In production we fail fast so the process
 * manager restarts the app once the database is reachable.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { env, isTest, isProd } = await import('@/env');

  try {
    const { ensureDbReady } = await import('@/db/migrate');
    await ensureDbReady();
  } catch (err) {
    console.error('[db] Klarte ikke å klargjøre databasen ved oppstart:', err);
    console.error(
      env.DATABASE_URL
        ? '[db] Sjekk DATABASE_URL og at Postgres kjører. Kjør `pnpm db:migrate` for å se full feilmelding.'
        : `[db] Sjekk at PGLITE_DIR (${env.PGLITE_DIR}) er skrivbar. Kjør \`pnpm db:migrate\` for å se full feilmelding.`,
    );
    if (isProd) throw err;
    return;
  }

  if (env.ENABLE_INTERNAL_SCHEDULER && !isTest) {
    import('@/server/scheduler')
      .then((m) => m.startScheduler())
      .catch((err) => console.error('[scheduler] Kunne ikke starte intern planlegger:', err));
  }
}
