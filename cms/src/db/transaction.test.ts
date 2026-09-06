import { sql } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { currentTransaction, db } from '@/db';
import { sites } from '@/db/schema';
import { useTestDb } from '@/test/db';

describe('db proxy transactions', () => {
  beforeAll(async () => {
    await useTestDb();
  });

  it('routes global db calls inside a transaction to the transaction (no PGlite deadlock)', async () => {
    const result = await Promise.race([
      db.transaction(async (tx) => {
        expect(currentTransaction()).toBeDefined();
        await tx.insert(sites).values({ slug: 'tx-a', name: 'A' });
        // Helper code that was not handed `tx` still sees the uncommitted row.
        const rows = await db.select({ slug: sites.slug }).from(sites).where(sql`${sites.slug} = 'tx-a'`);
        return rows.length;
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
    ]);
    expect(result).toBe(1);
    expect(currentTransaction()).toBeUndefined();
  });

  it('rolls back nested work when the callback throws', async () => {
    await expect(
      db.transaction(async () => {
        await db.insert(sites).values({ slug: 'tx-b', name: 'B' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.select({ slug: sites.slug }).from(sites).where(sql`${sites.slug} = 'tx-b'`);
    expect(rows).toHaveLength(0);
  });
});
