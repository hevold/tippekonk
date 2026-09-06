import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { requireApiKey } from '@/server/auth/guards';

import {
  createApiKey,
  generateApiKey,
  listApiKeys,
  looksLikeApiKey,
  revokeApiKey,
  verifyApiKey,
} from './index';

let db: Db;
let seed: SeedMinimalResult;

function ctxFor(user: User, role: MemberRole): AdminContext {
  return {
    user,
    site: seed.site,
    settings: parseSiteSettings(seed.site.settings),
    role,
    sites: [seed.site],
    locale: 'nb',
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip: null,
    sessionId: 'test-session',
  };
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('api keys', () => {
  it('generates dsk_ keys with 40 random characters', () => {
    const key = generateApiKey();
    expect(looksLikeApiKey(key.raw)).toBe(true);
    expect(key.raw.startsWith('dsk_')).toBe(true);
    expect(key.prefix).toBe(key.raw.slice(0, 8));
    expect(key.hash).toHaveLength(64);
    expect(generateApiKey().raw).not.toBe(key.raw);
  });

  it('creates, verifies and revokes keys; only the hash is stored', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    const { apiKey, raw } = await createApiKey(ctx, { name: 'Nettbutikk' });
    expect(apiKey.name).toBe('Nettbutikk');
    expect(apiKey.scopes).toEqual(['content:read']);
    expect('keyHash' in apiKey).toBe(false);
    expect(await verifyApiKey(raw)).toMatchObject({ id: apiKey.id });
    expect(await verifyApiKey('dsk_wrong')).toBeNull();

    const req = new Request('http://localhost/api/v1/site', { headers: { authorization: `Bearer ${raw}` } });
    const auth = await requireApiKey(req, 'content:read');
    expect(auth.site.id).toBe(seed.site.id);
    await expect(requireApiKey(req, 'content:write')).rejects.toThrow();
    await expect(requireApiKey(new Request('http://localhost/api/v1/site'))).rejects.toThrow(/API-nøkkel/);

    const revoked = await revokeApiKey(ctx, apiKey.id);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    expect(await verifyApiKey(raw)).toBeNull();
    await expect(requireApiKey(req)).rejects.toThrow();
    await expect(revokeApiKey(ctx, apiKey.id)).rejects.toThrow();
    const list = await listApiKeys(seed.site.id);
    expect(list).toHaveLength(1);
    await expect(createApiKey(ctx, { name: '' })).rejects.toThrow();
  });
});
