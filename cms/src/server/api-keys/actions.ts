'use server';
/**
 * API key server actions for /admin/innstillinger/api (integration:manage).
 */
import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { createApiKey, revokeApiKey, toApiKeyDto, type ApiKeyDto } from './index';

export async function createApiKeyAction(
  input: unknown,
): Promise<ActionResult<{ apiKey: ApiKeyDto; raw: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { apiKey, raw } = await createApiKey(ctx, input);
    return { apiKey: toApiKeyDto(apiKey), raw };
  });
}

export async function revokeApiKeyAction(input: unknown): Promise<ActionResult<ApiKeyDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    return toApiKeyDto(await revokeApiKey(ctx, uuidSchema.parse(input)));
  });
}
