/**
 * Password hashing with argon2id (@node-rs/argon2) using the OWASP-recommended
 * "19 MiB, 2 iterations, 1 lane" profile, plus the shared strength rule.
 *
 *   const hash = await hashPassword('Elvebyen2026!');
 *   await verifyPassword(hash, 'Elvebyen2026!')   // true
 *   validatePasswordStrength('kort')              // 'Passordet må ha minst 10 tegn'
 *
 * `verifyDummy()` lets the login path spend the same time when the user does
 * not exist, so timing does not reveal which e-mails are registered.
 */
import { hash, verify } from '@node-rs/argon2';

import { passwordStrengthError } from '@/lib/validation/user';

export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    // Malformed hash (e.g. legacy data) — treat as mismatch rather than crash.
    return false;
  }
}

/** Error message (bokmål) or null when acceptable: ≥ 10 chars with at least one letter and one digit. */
export function validatePasswordStrength(plain: string): string | null {
  return passwordStrengthError(plain);
}

let dummyHash: Promise<string> | null = null;

/** Verify against a throw-away hash so failed logins for unknown users take as long as real ones. */
export async function verifyDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('desken-dummy-password-0000');
  await verifyPassword(await dummyHash, plain);
}
