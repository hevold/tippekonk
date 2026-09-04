/**
 * Webhook event enqueueing. Called by content mutations (publish/unpublish,
 * layout publish, live posts). Implemented fully by the integrations area;
 * this initial module defines the contract so callers can compile.
 */
export type WebhookEvent =
  | 'article.published'
  | 'article.updated'
  | 'article.unpublished'
  | 'layout.published'
  | 'live.post_created';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'article.published',
  'article.updated',
  'article.unpublished',
  'layout.published',
  'live.post_created',
];

/**
 * Queue an event for every active webhook on the site subscribed to it.
 * Never throws; delivery happens asynchronously in the scheduler.
 */
export async function enqueueWebhookEvent(
  _siteId: string,
  _event: WebhookEvent,
  _data: Record<string, unknown>,
): Promise<void> {
  // INTEGRATION: replaced by src/server/webhooks/index.ts from the integrations area.
}
