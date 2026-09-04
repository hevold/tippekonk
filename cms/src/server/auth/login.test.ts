import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog, users } from '@/db/schema';
import { resetRateLimits } from '@/server/rate-limit';
import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

import { attemptLogin, LOGIN_RATE_LIMIT, verifySecondFactor } from './login';
import { createTotpSetup, generateTotpCode } from './totp';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  resetRateLimits();
  seed = await seedMinimal(db);
});

describe('attemptLogin', () => {
  it('succeeds with the right password, updates lastLoginAt and audits', async () => {
    const result = await attemptLogin({
      email: seed.editor.email.toUpperCase(),
      password: seed.password,
      ip: '1.2.3.4',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe(seed.editor.id);
    expect(result.mfaRequired).toBe(false);
    const [row] = await db.select().from(users).where(eq(users.id, seed.editor.id));
    expect(row?.lastLoginAt).not.toBeNull();
    const entries = await db.select().from(auditLog).where(eq(auditLog.action, 'auth.login'));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.userId).toBe(seed.editor.id);
    expect(entries[0]?.ip).toBe('1.2.3.4');
  });

  it('fails the same way for wrong password, unknown user and inactive user', async () => {
    expect(
      await attemptLogin({ email: seed.editor.email, password: 'wrong-password-1', ip: null }),
    ).toMatchObject({ ok: false, reason: 'invalid' });
    expect(
      await attemptLogin({ email: 'ukjent@test.local', password: seed.password, ip: null }),
    ).toMatchObject({ ok: false, reason: 'invalid' });
    await db.update(users).set({ isActive: false }).where(eq(users.id, seed.editor.id));
    expect(await attemptLogin({ email: seed.editor.email, password: seed.password, ip: null })).toMatchObject(
      { ok: false, reason: 'inactive' },
    );
  });

  it('rate limits after 10 attempts per ip+email and resets on success', async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i++) {
      const r = await attemptLogin({
        email: seed.journalist.email,
        password: 'wrong-password-1',
        ip: '9.9.9.9',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid');
    }
    const blocked = await attemptLogin({
      email: seed.journalist.email,
      password: seed.password,
      ip: '9.9.9.9',
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('rate_limited');
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
    // Another ip is unaffected.
    const other = await attemptLogin({
      email: seed.journalist.email,
      password: seed.password,
      ip: '8.8.8.8',
    });
    expect(other.ok).toBe(true);
  });

  it('requires a second factor when TOTP is enabled and accepts app and recovery codes', async () => {
    const setup = createTotpSetup(seed.admin.email);
    await db
      .update(users)
      .set({ totpSecret: setup.encrypted, totpEnabled: true })
      .where(eq(users.id, seed.admin.id));
    const result = await attemptLogin({ email: seed.admin.email, password: seed.password, ip: null });
    expect(result.ok && result.mfaRequired).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.id, seed.admin.id));
    expect(await verifySecondFactor(user!, '000000', null)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(await verifySecondFactor(user!, generateTotpCode(setup.secret), null)).toMatchObject({
      ok: true,
      method: 'totp',
    });

    const recovery = await verifySecondFactor(user!, setup.recoveryCodes[0]!, null);
    expect(recovery).toMatchObject({ ok: true, method: 'recovery', remainingRecoveryCodes: 7 });
    const [after] = await db.select().from(users).where(eq(users.id, seed.admin.id));
    expect(await verifySecondFactor(after!, setup.recoveryCodes[0]!, null)).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
  });
});
