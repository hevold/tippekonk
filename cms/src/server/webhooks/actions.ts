'use server';
/**
 * Webhook server actions for /admin/innstillinger/webhooks. All require
 * `integration:manage`; input is validated with Zod inside the service.
 */
import { z } from 'zod';

import { uuidSchema } from '@/lib/validation/common';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import {
  createWebhook,
  deleteWebhook,
  listDeliveries,
  redeliver,
  regenerateWebhookSecret,
  sendTestEvent,
  setWebhookActive,
  updateWebhook,
  type DeliveryView,
} from './index';

/** Plain (serialisable) subscription for the client table. */
export type WebhookDto = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
};

export type DeliveryDto = {
  id: string;
  event: string;
  status: DeliveryView['status'];
  attempts: number;
  deliveredAt: string | null;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

function toDto(w: { id: string; name: string; url: string; events: string[]; isActive: boolean; createdAt: Date }): WebhookDto {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events,
    isActive: w.isActive,
    createdAt: w.createdAt.toISOString(),
  };
}

function toDeliveryDto(d: DeliveryView): DeliveryDto {
  return {
    id: d.id,
    event: d.event,
    status: d.status,
    attempts: d.attempts,
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
    nextAttemptAt: d.nextAttemptAt.toISOString(),
    lastStatusCode: d.lastStatusCode,
    lastError: d.lastError,
    createdAt: d.createdAt.toISOString(),
    payload: d.payload,
  };
}

const updateSchema = z.object({ id: uuidSchema, input: z.unknown() });
const activeSchema = z.object({ id: uuidSchema, isActive: z.boolean() });

export async function createWebhookAction(
  input: unknown,
): Promise<ActionResult<{ webhook: WebhookDto; secret: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { webhook, secret } = await createWebhook(ctx, input);
    return { webhook: toDto(webhook), secret };
  });
}

export async function updateWebhookAction(input: unknown): Promise<ActionResult<WebhookDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id, input: data } = updateSchema.parse(input);
    return toDto(await updateWebhook(ctx, id, data));
  });
}

export async function setWebhookActiveAction(input: unknown): Promise<ActionResult<WebhookDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { id, isActive } = activeSchema.parse(input);
    return toDto(await setWebhookActive(ctx, id, isActive));
  });
}

export async function deleteWebhookAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    await deleteWebhook(ctx, uuidSchema.parse(input));
  });
}

export async function regenerateWebhookSecretAction(
  input: unknown,
): Promise<ActionResult<{ webhook: WebhookDto; secret: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const { webhook, secret } = await regenerateWebhookSecret(ctx, uuidSchema.parse(input));
    return { webhook: toDto(webhook), secret };
  });
}

export async function listDeliveriesAction(input: unknown): Promise<ActionResult<DeliveryDto[]>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    const rows = await listDeliveries(ctx.site.id, uuidSchema.parse(input));
    return rows.map(toDeliveryDto);
  });
}

export async function redeliverAction(input: unknown): Promise<ActionResult<DeliveryDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    return toDeliveryDto(await redeliver(ctx, uuidSchema.parse(input)));
  });
}

export async function sendTestEventAction(input: unknown): Promise<ActionResult<DeliveryDto>> {
  return runAction(async () => {
    const ctx = await requirePermission('integration:manage');
    return toDeliveryDto(await sendTestEvent(ctx, uuidSchema.parse(input)));
  });
}
