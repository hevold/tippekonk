'use server';
/**
 * Webhook server actions for /admin/innstillinger/webhooks (integration:manage).
 */
import { z } from 'zod';

import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { toDeliveryDto, toWebhookDto, type DeliveryDto, type WebhookDto } from './dto';
import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  redeliver,
  regenerateWebhookSecret,
  sendTestEvent,
  setWebhookActive,
  updateWebhook,
} from './index';

const idSchema = z.object({ id: uuidSchema });
const updateSchema = z.object({ id: uuidSchema, input: z.unknown() });
const activeSchema = z.object({ id: uuidSchema, isActive: z.boolean() });
const deliveriesSchema = z.object({
  id: uuidSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function createWebhookAction(
  input: unknown,
): Promise<ActionResult<{ webhook: WebhookDto; secret: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { webhook, secret } = await createWebhook(ctx, input);
    return {
      webhook: toWebhookDto({ ...webhook, deliveryCount: 0, failedCount: 0, lastDeliveryAt: null }),
      secret,
    };
  });
}

export async function updateWebhookAction(input: unknown): Promise<ActionResult<WebhookDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id, input: data } = updateSchema.parse(input);
    const row = await updateWebhook(ctx, id, data);
    const stats = (await listWebhooks(ctx.site.id)).find((w) => w.id === row.id);
    return toWebhookDto(stats ?? { ...row, deliveryCount: 0, failedCount: 0, lastDeliveryAt: null });
  });
}

export async function setWebhookActiveAction(input: unknown): Promise<ActionResult<WebhookDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id, isActive } = activeSchema.parse(input);
    const row = await setWebhookActive(ctx, id, isActive);
    const stats = (await listWebhooks(ctx.site.id)).find((w) => w.id === row.id);
    return toWebhookDto(stats ?? { ...row, deliveryCount: 0, failedCount: 0, lastDeliveryAt: null });
  });
}

export async function deleteWebhookAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id } = idSchema.parse(input);
    await deleteWebhook(ctx, id);
  });
}

export async function regenerateWebhookSecretAction(
  input: unknown,
): Promise<ActionResult<{ secret: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id } = idSchema.parse(input);
    const { secret } = await regenerateWebhookSecret(ctx, id);
    return { secret };
  });
}

export async function listWebhookDeliveriesAction(input: unknown): Promise<ActionResult<DeliveryDto[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id, limit } = deliveriesSchema.parse(input);
    return (await listDeliveries(ctx.site.id, id, limit)).map(toDeliveryDto);
  });
}

export async function redeliverWebhookAction(input: unknown): Promise<ActionResult<DeliveryDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id } = idSchema.parse(input);
    return toDeliveryDto(await redeliver(ctx, id));
  });
}

export async function testWebhookAction(input: unknown): Promise<ActionResult<DeliveryDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id } = idSchema.parse(input);
    return toDeliveryDto(await sendTestEvent(ctx, id));
  });
}
