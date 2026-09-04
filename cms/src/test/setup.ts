/**
 * Vitest global setup. Feature tests that need a database call
 * `await useTestDb()` from '@/test/db' in beforeAll; the in-memory PGlite
 * instance is closed here after each test file.
 */
import { afterAll } from 'vitest';

import { teardownTestDb } from '@/test/db';

afterAll(async () => {
  await teardownTestDb().catch(() => {});
});
