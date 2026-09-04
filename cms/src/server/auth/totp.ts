/**
 * Time-based one-time passwords (RFC 6238) via `otpauth`, plus recovery codes.
 *
 * The user's TOTP secret and the hashes of their recovery codes are stored
 * together as one AES-256-GCM encrypted JSON payload in `users.totpSecret`:
 *   { secret: <base32>, recovery: [<sha256 hex>, …] }
 *
 *   const setup = createTotpSetup(email);            // secret, otpauth URI, plain recovery codes
 *   verifyTotpCode(secret, '123456')                 // boolean (±1 step)
 *   const { payload, remaining } = consumeRecoveryCode(payload, 'abcd-efgh') // consumes one code
 */
import { randomBytes } from 'node:crypto';

import * as OTPAuth from 'otpauth';

import { decryptSecret, encryptSecret, sha256Hex, timingSafeEqualStr } from './crypto';

export const TOTP_ISSUER = 'Desken';
export const RECOVERY_CODE_COUNT = 8;

export type TotpPayload = { secret: string; recovery: string[] };

export type TotpSetup = {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
  /** Encrypted payload ready for `users.totpSecret`. */
  encrypted: string;
};

function totpFor(secret: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TOTP_ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/** Letters/digits that are easy to read aloud (no 0/O, 1/l/I). */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomCode(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

export function normalizeRecoveryCode(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function hashRecoveryCode(code: string): string {
  return sha256Hex(normalizeRecoveryCode(code));
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => randomCode());
}

export function createTotpSetup(accountLabel: string): TotpSetup {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const recoveryCodes = generateRecoveryCodes();
  const payload: TotpPayload = { secret, recovery: recoveryCodes.map(hashRecoveryCode) };
  return {
    secret,
    otpauthUrl: totpFor(secret, accountLabel).toString(),
    recoveryCodes,
    encrypted: encryptSecret(JSON.stringify(payload)),
  };
}

export function encodeTotpPayload(payload: TotpPayload): string {
  return encryptSecret(JSON.stringify(payload));
}

/** Decrypt and validate the stored payload; null when missing or tampered with. */
export function decodeTotpPayload(stored: string | null | undefined): TotpPayload | null {
  if (!stored) return null;
  const json = decryptSecret(stored);
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const { secret, recovery } = parsed as { secret?: unknown; recovery?: unknown };
    if (typeof secret !== 'string' || !secret) return null;
    const codes = Array.isArray(recovery) ? recovery.filter((c): c is string => typeof c === 'string') : [];
    return { secret, recovery: codes };
  } catch {
    return null;
  }
}

/** Accepts the current step and one step on either side to absorb clock drift. */
export function verifyTotpCode(secret: string, code: string, timestamp: number = Date.now()): boolean {
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  const delta = totpFor(secret, 'verify').validate({ token, timestamp, window: 1 });
  return delta !== null;
}

/** Current code for a secret (tests). */
export function generateTotpCode(secret: string, timestamp: number = Date.now()): string {
  return totpFor(secret, 'generate').generate({ timestamp });
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input).length === 8;
}

/**
 * Consume a recovery code. Returns the updated payload (code removed) or null
 * when the code does not match any remaining code.
 */
export function consumeRecoveryCode(
  payload: TotpPayload,
  input: string,
): { payload: TotpPayload; remaining: number } | null {
  const hashed = hashRecoveryCode(input);
  const index = payload.recovery.findIndex((h) => timingSafeEqualStr(h, hashed));
  if (index === -1) return null;
  const recovery = payload.recovery.filter((_, i) => i !== index);
  return { payload: { ...payload, recovery }, remaining: recovery.length };
}
