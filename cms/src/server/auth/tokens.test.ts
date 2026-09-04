import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authTokens } from '@/db/schema';
import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

import { consumeToken, createToken, hashToken, invalidateTokens, peekToken } from './tokens';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('one-time tokens', () => {
  it('stores only the hash and consumes exactly once', async () => {
    const raw = await createToken('invite', {
      userId: seed.contributor.id,
      siteId: seed.site.id,
      ttlMinutes: 60,
      meta: { role: 'editor' },
    });
    const rows = await db
      .select()
      .from(authTokens)
      .where(eq(authTokens.tokenHash, hashToken(raw)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.meta).toEqual({ role: 'editor' });

    expect(await peekToken('invite', raw)).not.toBeNull();
    expect(await consumeToken('password_reset', raw)).toBeNull(); // wrong kind
    const consumed = await consumeToken('invite', raw);
    expect(consumed?.userId).toBe(seed.contributor.id);
    expect(await consumeToken('invite', raw)).toBeNull(); // second use
    expect(await peekToken('invite', raw)).toBeNull();
  });

  it('rejects expired tokens and invalidates by kind + user', async () => {
    const raw = await createToken('password_reset', { userId: seed.editor.id, ttlMinutes: 1 });
    await db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(authTokens.tokenHash, hashToken(raw)));
    expect(await consumeToken('password_reset', raw)).toBeNull();

    const a = await createToken('invite', { userId: seed.editor.id, ttlMinutes: 60 });
    const b = await createToken('invite', { userId: seed.editor.id, ttlMinutes: 60 });
    await invalidateTokens('invite', seed.editor.id);
    expect(await consumeToken('invite', a)).toBeNull();
    expect(await consumeToken('invite', b)).toBeNull();
  });

  it('handles concurrent consumption atomically', async () => {
    const raw = await createToken('email_verify', { userId: seed.editor.id, ttlMinutes: 60 });
    const results = await Promise.all([
      consumeToken('email_verify', raw),
      consumeToken('email_verify', raw),
      consumeToken('email_verify', raw),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});
