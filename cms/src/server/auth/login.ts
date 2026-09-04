/**
 * Login service — pure business logic behind the login and 2FA server
 * actions. No Next.js imports, so it is tested directly against the test
 * database.
 *
 *   const result = await attemptLogin({ email, password, ip });
 *   // { ok: true, user, mfaRequired } | { ok: false, reason: 'invalid' | 'rate_limited' | 'inactive', retryAfterSec }
 *
 * Rules: 10 attempts per 15 minutes per ip+email (in-memory), constant-time
 * failure path (a dummy hash is verified when the user is unknown or has no
 * password yet), `lastLoginAt` updated and 'auth.login' audited on success.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users, type User } from '@/db/schema';
import { audit } from '@/server/audit';
import { clearRateLimit, rateLimit } from '@/server/rate-limit';

import { verifyDummy, verifyPassword } from './password';
import {
  decodeTotpPayload,
  encodeTotpPayload,
  looksLikeRecoveryCode,
  consumeRecoveryCode,
  verifyTotpCode,
} from './totp';

export const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 15 * 60_000 } as const;
export const TOTP_RATE_LIMIT = { limit: 8, windowMs: 15 * 60_000 } as const;

export type LoginFailureReason = 'invalid' | 'rate_limited' | 'inactive';

export type LoginResult =
  | { ok: true; user: User; mfaRequired: boolean }
  | { ok: false; reason: LoginFailureReason; retryAfterSec: number };

export type LoginInput = {
  email: string;
  password: string;
  ip: string | null;
  userAgent?: string | null;
};

export function loginRateKey(ip: string | null, email: string): string {
  return `login:${ip ?? 'local'}:${email.trim().toLowerCase()}`;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return rows[0] ?? null;
}

export async function attemptLogin(input: LoginInput): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  const key = loginRateKey(input.ip, email);
  const limit = rateLimit(key, LOGIN_RATE_LIMIT);
  if (!limit.ok) {
    await audit(
      { ip: input.ip },
      { action: 'auth.login_rate_limited', summary: `Innlogging sperret for ${email}` },
    );
    return { ok: false, reason: 'rate_limited', retryAfterSec: limit.retryAfterSec };
  }

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    await verifyDummy(input.password);
    return { ok: false, reason: 'invalid', retryAfterSec: 0 };
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    await audit(
      { user, ip: input.ip },
      {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user.id,
        summary: `Feil passord for ${email}`,
      },
    );
    return { ok: false, reason: 'invalid', retryAfterSec: 0 };
  }
  if (!user.isActive) {
    return { ok: false, reason: 'inactive', retryAfterSec: 0 };
  }

  clearRateLimit(key);
  const now = new Date();
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  await audit(
    { user, ip: input.ip },
    {
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} logget inn`,
      data: input.userAgent ? { userAgent: input.userAgent.slice(0, 200) } : undefined,
    },
  );
  return { ok: true, user: { ...user, lastLoginAt: now }, mfaRequired: user.totpEnabled };
}

export type SecondFactorResult =
  | { ok: true; method: 'totp' | 'recovery'; remainingRecoveryCodes: number | null }
  | { ok: false; reason: 'invalid' | 'rate_limited' | 'not_enabled'; retryAfterSec: number };

/**
 * Verify a second factor for a user: a 6-digit TOTP code or a recovery code
 * (`xxxx-xxxx`). Recovery codes are single-use; the stored payload is
 * rewritten without the used code.
 */
export async function verifySecondFactor(
  user: User,
  code: string,
  ip: string | null,
): Promise<SecondFactorResult> {
  const key = `totp:${user.id}`;
  const limit = rateLimit(key, TOTP_RATE_LIMIT);
  if (!limit.ok) return { ok: false, reason: 'rate_limited', retryAfterSec: limit.retryAfterSec };

  const payload = decodeTotpPayload(user.totpSecret);
  if (!user.totpEnabled || !payload) return { ok: false, reason: 'not_enabled', retryAfterSec: 0 };

  const trimmed = code.trim();
  if (verifyTotpCode(payload.secret, trimmed)) {
    clearRateLimit(key);
    await audit({ user, ip }, { action: 'auth.mfa_verified', entityType: 'user', entityId: user.id });
    return { ok: true, method: 'totp', remainingRecoveryCodes: null };
  }
  if (looksLikeRecoveryCode(trimmed)) {
    const used = consumeRecoveryCode(payload, trimmed);
    if (used) {
      await db
        .update(users)
        .set({ totpSecret: encodeTotpPayload(used.payload) })
        .where(eq(users.id, user.id));
      clearRateLimit(key);
      await audit(
        { user, ip },
        {
          action: 'auth.recovery_code_used',
          entityType: 'user',
          entityId: user.id,
          summary: `Gjenopprettingskode brukt (${used.remaining} igjen)`,
        },
      );
      return { ok: true, method: 'recovery', remainingRecoveryCodes: used.remaining };
    }
  }
  await audit({ user, ip }, { action: 'auth.mfa_failed', entityType: 'user', entityId: user.id });
  return { ok: false, reason: 'invalid', retryAfterSec: 0 };
}
