/**
 * API keys for the public JSON API (/api/v1). A key is `dsk_` followed by
 * 40 random alphanumeric characters; only its SHA-256 is stored, plus the
 * first 8 characters so people can tell keys apart in the admin.
 *
 *   const { apiKey, raw } = await createApiKey(ctx, { name: 'Nettbutikk' });  // raw shown once
 *   await revokeApiKey(ctx, apiKey.id);
 *   const keys = await listApiKeys(ctx.site.id);
 *
 * Request authentication lives in `requireApiKey()` (src/server/auth/guards.ts).
 */
import { randomInt } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { apiKeys, type ApiKey } from '@/db/schema';
import { trimmed } from '@/lib/validation/common';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { sha256Hex } from '@/server/auth/crypto';

export const API_KEY_PREFIX = 'dsk_';
export const API_KEY_RANDOM_LENGTH = 40;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 8;

export const API_KEY_SCOPES = ['content:read'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export type GeneratedKey = { raw: string; prefix: string; hash: string };

/** A fresh key: raw value (returned once), display prefix and storable hash. */
export function generateApiKey(): GeneratedKey {
  let random = '';
  for (let i = 0; i < API_KEY_RANDOM_LENGTH; i++) random += ALPHABET[randomInt(ALPHABET.length)];
  const raw = `${API_KEY_PREFIX}${random}`;
  return { raw, prefix: raw.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH), hash: sha256Hex(raw) };
}

export function looksLikeApiKey(value: string): boolean {
  return new RegExp(`^${API_KEY_PREFIX}[A-Za-z0-9]{${API_KEY_RANDOM_LENGTH}}$`).test(value);
}

export const apiKeyInputSchema = z.object({
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .default(['content:read'])
    .transform((list) => (list.length ? [...new Set(list)] : ['content:read'])),
});
export type ApiKeyInput = z.infer<typeof apiKeyInputSchema>;

/** What the admin sees: never the hash. */
export type ApiKeySummary = Omit<ApiKey, 'keyHash'>;

function summarize(row: ApiKey): ApiKeySummary {
  const { keyHash: _hash, ...rest } = row;
  void _hash;
  return rest;
}

/** Serialisable summary for client components. */
export type ApiKeyDto = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function toApiKeyDto(k: ApiKeySummary): ApiKeyDto {
  return {
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    scopes: k.scopes,
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    createdAt: k.createdAt.toISOString(),
  };
}

export async function listApiKeys(siteId: string): Promise<ApiKeySummary[]> {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.siteId, siteId))
    .orderBy(desc(apiKeys.createdAt));
  return rows.map(summarize);
}

export async function createApiKey(
  ctx: AdminContext,
  input: unknown,
): Promise<{ apiKey: ApiKeySummary; raw: string }> {
  const data = apiKeyInputSchema.parse(input);
  const generated = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      siteId: ctx.site.id,
      name: data.name,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      scopes: data.scopes,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw new ActionError('Kunne ikke opprette API-nøkkelen.');
  await auditFromContext(ctx, {
    action: 'api_key.create',
    entityType: 'api_key',
    entityId: row.id,
    summary: `Opprettet API-nøkkel «${row.name}» (${row.keyPrefix}…)`,
    data: { scopes: row.scopes },
  });
  return { apiKey: summarize(row), raw: generated.raw };
}

export async function revokeApiKey(ctx: AdminContext, id: string): Promise<ApiKeySummary> {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.siteId, ctx.site.id), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke en aktiv API-nøkkel med denne id-en.');
  await auditFromContext(ctx, {
    action: 'api_key.revoke',
    entityType: 'api_key',
    entityId: row.id,
    summary: `Trakk tilbake API-nøkkel «${row.name}» (${row.keyPrefix}…)`,
  });
  return summarize(row);
}

/** Look up an active key by its raw value (tests and scripts; requests use requireApiKey). */
export async function verifyApiKey(raw: string): Promise<ApiKey | null> {
  if (!raw) return null;
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256Hex(raw)), isNull(apiKeys.revokedAt)))
    .limit(1);
  return row ?? null;
}
