/**
 * Database client. Uses postgres-js when DATABASE_URL is set, otherwise an
 * embedded PGlite database persisted under PGLITE_DIR (zero-config dev).
 *
 * Usage:   import { db } from '@/db';  db.select().from(articles)...
 * Tests:   import { setDb } from '@/db'; setDb(await createTestDb());
 *
 * `db` is a lazy proxy so that importing this module has no side effects and
 * tests can swap the underlying instance.
 *
 * Transactions: `db.transaction(async (tx) => { ... })` stores `tx` in an
 * AsyncLocalStorage for the duration of the callback, and every access to the
 * global `db` inside that callback (including in helpers such as audit() or
 * notify() that were not handed the tx) transparently resolves to the same
 * transaction. This matters for PGlite, which serialises all queries on one
 * connection: a query on the root connection while a transaction holds it
 * would otherwise deadlock forever. Nested `db.transaction()` calls become
 * savepoints.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';

import * as schema from './schema';

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export { schema };

type Holder = {
  instance: Db | null;
  creating: Promise<Db> | null;
  driver: 'postgres' | 'pglite' | null;
  close: (() => Promise<void>) | null;
};

const g = globalThis as unknown as { __deskenDb?: Holder; __deskenTx?: AsyncLocalStorage<Tx> };
const txStorage: AsyncLocalStorage<Tx> = (g.__deskenTx ??= new AsyncLocalStorage<Tx>());
const holder: Holder = (g.__deskenDb ??= { instance: null, creating: null, driver: null, close: null });

async function createDb(): Promise<Db> {
  const { env } = await import('@/env');
  if (env.DATABASE_URL) {
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const postgres = (await import('postgres')).default;
    const client = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'production' ? 10 : 5,
      onnotice: () => {},
    });
    holder.driver = 'postgres';
    holder.close = () => client.end({ timeout: 5 });
    return drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db;
  }
  const { drizzle } = await import('drizzle-orm/pglite');
  const { PGlite } = await import('@electric-sql/pglite');
  // PGlite only creates the leaf directory; make sure the parents exist (./data/pglite on a fresh checkout).
  const { mkdirSync } = await import('node:fs');
  mkdirSync(env.PGLITE_DIR, { recursive: true });
  const client = new PGlite(env.PGLITE_DIR);
  await client.waitReady;
  holder.driver = 'pglite';
  holder.close = () => client.close();
  return drizzle(client, { schema, casing: 'snake_case' }) as unknown as Db;
}

/** Ensure the database client exists (and, if AUTO_MIGRATE, migrations are applied). */
export async function getDb(): Promise<Db> {
  if (holder.instance) return holder.instance;
  if (!holder.creating) {
    holder.creating = (async () => {
      const instance = await createDb();
      holder.instance = instance;
      return instance;
    })();
  }
  return holder.creating;
}

/** Replace the active database (tests) or reset it (null). */
export function setDb(instance: Db | null, driver: Holder['driver'] = 'pglite'): void {
  holder.instance = instance;
  holder.creating = instance ? Promise.resolve(instance) : null;
  holder.driver = instance ? driver : null;
}

export function dbDriver(): Holder['driver'] {
  return holder.driver;
}

export async function closeDb(): Promise<void> {
  const close = holder.close;
  holder.instance = null;
  holder.creating = null;
  holder.driver = null;
  holder.close = null;
  if (close) await close();
}

/**
 * Lazy proxy: every property access resolves the real instance synchronously.
 * Call `await getDb()` once at startup (instrumentation.ts does) before using
 * `db` in request handlers; in tests, `setDb()` first.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const current = txStorage.getStore();
    const real: Db | Tx | null = current ?? holder.instance;
    if (!real) {
      throw new Error(
        'Databasen er ikke initialisert. Kall `await getDb()` (gjøres i instrumentation.ts) eller `setDb()` i tester.',
      );
    }
    if (prop === 'transaction') {
      // Run the callback with the transaction stored in AsyncLocalStorage so
      // that nested `db.*` calls (in helpers) reuse it instead of deadlocking.
      return (fn: (tx: Tx) => Promise<unknown>, config?: unknown) =>
        (real as Db).transaction(
          (tx: Tx) => txStorage.run(tx, () => fn(tx)),
          config as Parameters<Db['transaction']>[1],
        );
    }
    const value = (real as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

/** The transaction the current async context runs in, if any. */
export function currentTransaction(): Tx | undefined {
  return txStorage.getStore();
}
