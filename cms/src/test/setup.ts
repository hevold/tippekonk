/**
 * Vitest global setup. Feature tests that need a database call
 * `await useTestDb()` from '@/test/db' in beforeAll.
 */
import { afterAll } from 'vitest';

import { closeDb } from '@/db';

afterAll(async () => {
  await closeDb().catch(() => {});
});
