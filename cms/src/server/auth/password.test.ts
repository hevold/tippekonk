import { describe, expect, it } from 'vitest';

import { decryptSecret, encryptSecret, randomToken, sha256Hex, timingSafeEqualStr } from './crypto';
import { hashPassword, validatePasswordStrength, verifyPassword } from './password';
import {
  createTotpSetup,
  decodeTotpPayload,
  generateTotpCode,
  consumeRecoveryCode,
  verifyTotpCode,
} from './totp';

describe('password hashing', () => {
  it('hashes with argon2id and verifies the plain text', async () => {
    const hash = await hashPassword('Elvebyen2026!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=19456,t=2,p=1');
    expect(await verifyPassword(hash, 'Elvebyen2026!')).toBe(true);
    expect(await verifyPassword(hash, 'elvebyen2026!')).toBe(false);
  });

  it('never throws on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });

  it('enforces the strength rule with Norwegian messages', () => {
    expect(validatePasswordStrength('kort1')).toMatch(/minst 10 tegn/);
    expect(validatePasswordStrength('bareBokstaver')).toMatch(/tall/);
    expect(validatePasswordStrength('1234567890')).toMatch(/bokstav/);
    expect(validatePasswordStrength('Elvebyen2026!')).toBeNull();
  });
});

describe('crypto helpers', () => {
  it('produces url-safe random tokens and stable sha256', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('round-trips AES-256-GCM and rejects the wrong key or tampering', () => {
    const payload = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(payload)).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(payload, 'another-secret-another-secret')).toBeNull();
    const parts = payload.split('.');
    parts[3] = parts[3]!.slice(0, -2) + 'AA';
    expect(decryptSecret(parts.join('.'))).toBeNull();
    expect(decryptSecret('garbage')).toBeNull();
  });

  it('compares strings in constant time semantics', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });
});

describe('totp', () => {
  it('creates a setup whose current code validates and whose payload decodes', () => {
    const setup = createTotpSetup('kari@avisa.no');
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Desken:kari%40avisa.no\?/);
    expect(setup.recoveryCodes).toHaveLength(8);
    expect(setup.recoveryCodes[0]).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/);
    const payload = decodeTotpPayload(setup.encrypted);
    expect(payload?.secret).toBe(setup.secret);
    expect(payload?.recovery).toHaveLength(8);
    const code = generateTotpCode(setup.secret);
    expect(verifyTotpCode(setup.secret, code)).toBe(true);
    expect(verifyTotpCode(setup.secret, '000000')).toBe(false);
    expect(verifyTotpCode(setup.secret, 'abc')).toBe(false);
  });

  it('consumes recovery codes once', () => {
    const setup = createTotpSetup('kari@avisa.no');
    const payload = decodeTotpPayload(setup.encrypted)!;
    const first = consumeRecoveryCode(payload, setup.recoveryCodes[2]!.toUpperCase());
    expect(first?.remaining).toBe(7);
    expect(consumeRecoveryCode(first!.payload, setup.recoveryCodes[2]!)).toBeNull();
    expect(consumeRecoveryCode(first!.payload, 'zzzz-zzzz')).toBeNull();
  });
});
