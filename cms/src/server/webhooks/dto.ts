/**
 * Serialisable webhook shapes for client components. Secrets never leave
 * the server except once, right after they are generated.
 */
import { deliveryStatus, type DeliveryStatus, type DeliveryView, type WebhookWithStats } from './index';

export type WebhookDto = {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  deliveryCount: number;
  failedCount: number;
  lastDeliveryAt: string | null;
};

export type DeliveryDto = {
  id: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  deliveredAt: string | null;
  nextAttemptAt: string;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
};

export function toWebhookDto(w: WebhookWithStats): WebhookDto {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events,
    isActive: w.isActive,
    createdAt: w.createdAt.toISOString(),
    deliveryCount: w.deliveryCount,
    failedCount: w.failedCount,
    lastDeliveryAt: w.lastDeliveryAt ? w.lastDeliveryAt.toISOString() : null,
  };
}

export function toDeliveryDto(d: DeliveryView | Omit<DeliveryView, 'status'>): DeliveryDto {
  return {
    id: d.id,
    event: d.event,
    status: 'status' in d ? d.status : deliveryStatus(d),
    attempts: d.attempts,
    deliveredAt: d.deliveredAt ? d.deliveredAt.toISOString() : null,
    nextAttemptAt: d.nextAttemptAt.toISOString(),
    lastStatusCode: d.lastStatusCode,
    lastError: d.lastError,
    createdAt: d.createdAt.toISOString(),
    payload: d.payload,
  };
}
