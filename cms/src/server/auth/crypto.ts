/**
 * Small cryptographic helpers for the auth area:
 *
 *  - `randomToken()`      32 random bytes as base64url (session and one-time tokens)
 *  - `sha256Hex()`        hash a token for storage (never store raw tokens)
 *  - `encryptSecret()` / `decryptSecret()`
 *                         AES-256-GCM with a key derived from APP_SECRET via scrypt,
 *                         used for TOTP secrets at rest. Output format:
 *                         `v1.<iv>.<tag>.<ciphertext>` (all base64url).
 *  - `timingSafeEqualStr()` compare secrets without leaking length/prefix timing.
 *
 * Pure Node `crypto`; no Next.js imports so it is fully unit-testable.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

import { env } from '@/env';

const KEY_SALT = 'desken.totp.v1';
const ALGO = 'aes-256-gcm';

let cachedKey: { secret: string; key: Buffer } | null = null;

function deriveKey(secret: string = env.APP_SECRET): Buffer {
  if (cachedKey && cachedKey.secret === secret) return cachedKey.key;
  const key = scryptSync(secret, KEY_SALT, 32, { N: 16384, r: 8, p: 1 });
  cachedKey = { secret, key };
  return key;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function encryptSecret(plain: string, secret?: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(
    '.',
  );
}

/** Returns null when the payload is malformed or was encrypted with another key. */
export function decryptSecret(payload: string, secret?: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const key = deriveKey(secret);
    const iv = Buffer.from(parts[1]!, 'base64url');
    const tag = Buffer.from(parts[2]!, 'base64url');
    const data = Buffer.from(parts[3]!, 'base64url');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    // Compare against itself to keep the timing profile flat, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
