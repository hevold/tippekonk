/**
 * Webhooks: subscriptions (CRUD), event enqueueing and delivery.
 *
 *   await enqueueWebhookEvent(siteId, 'article.published', { id, title, … });
 *   const { delivered, failed } = await deliverPending(20);      // scheduler tick
 *   await redeliver(ctx, deliveryId);                            // "Send på nytt"
 *
 * Enqueueing writes one `webhook_deliveries` row per active webhook that
 * subscribes to the event. Delivery POSTs the JSON payload with a 10 s
 * timeout and an HMAC-SHA256 signature over the raw body:
 *   X-Desken-Event, X-Desken-Delivery, X-Desken-Signature: sha256=<hex>
 * Failures are retried with exponential backoff (1 min × 2^attempts) up to
 * MAX_ATTEMPTS. Rows are claimed with an atomic UPDATE … RETURNING lease so
 * several instances can run the scheduler concurrently without double sends.
 */
import { createHmac, randomUUID } from 'node:crypto';

import { and, asc, desc, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/db';
import { sites, webhookDeliveries, webhooks, type Webhook, type WebhookDelivery } from '@/db/schema';
import { env } from '@/env';
import { formBoolean, trimmed, uuidSchema } from '@/lib/validation/common';
import { ActionError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { randomToken } from '@/server/auth/crypto';

/* -------------------------------------------------------------------------- */
/*  Contract (kept stable for the other areas)                                 */
/* -------------------------------------------------------------------------- */

export type WebhookEvent =
  'article.published' | 'article.updated' | 'article.unpublished' | 'layout.published' | 'live.post_created';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'article.published',
  'article.updated',
  'article.unpublished',
  'layout.published',
  'live.post_created',
];

/** Sent by "Test" in the admin; never enqueued by content mutations. */
export const PING_EVENT = 'ping';

export const MAX_ATTEMPTS = 8;
export const DELIVERY_TIMEOUT_MS = 10_000;
/** How long a claimed row stays invisible to other workers while it is being sent. */
const LEASE_MS = 2 * 60_000;
const BASE_BACKOFF_MS = 60_000;

export type WebhookPayload = {
  id: string;
  event: string;
  createdAt: string;
  site: { id: string; slug: string };
  data: Record<string, unknown>;
};

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Delay before the next try after `attempts` failed attempts: 1, 2, 4, 8 … minutes. */
export function backoffMs(attempts: number): number {
  const n = Math.max(0, Math.min(attempts, MAX_ATTEMPTS));
  return BASE_BACKOFF_MS * 2 ** n;
}

/** `sha256=<hex>` HMAC of the raw request body. */
export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

export function buildPayload(
  site: { id: string; slug: string },
  event: string,
  data: Record<string, unknown>,
  id: string = randomUUID(),
  createdAt: Date = new Date(),
): WebhookPayload {
  return { id, event, createdAt: createdAt.toISOString(), site: { id: site.id, slug: site.slug }, data };
}

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === 'string' && (WEBHOOK_EVENTS as string[]).includes(value);
}

export function generateWebhookSecret(): string {
  return randomToken(32);
}

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isInternalIpv4(host: string): boolean {
  const o = ipv4Octets(host);
  if (!o) return false;
  const [a, b] = o as [number, number, number, number];
  return (
    a === 0 || // "this" network
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) || // RFC 1918
    a >= 224 // multicast, reserved, broadcast
  );
}

function isInternalIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::' || h === '::1') return true;
  // IPv4-mapped (::ffff:10.0.0.1) and NAT64 (64:ff9b::10.0.0.1) forms embed a v4 address;
  // the URL parser serialises the mapped address as two hex groups (::ffff:a00:1).
  const dotted = /^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (dotted) return isInternalIpv4(dotted[1]!);
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const hi = Number.parseInt(hex[1]!, 16);
    const lo = Number.parseInt(hex[2]!, 16);
    return isInternalIpv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h); // ULA fc00::/7, link-local fe80::/10
}

/**
 * Hosts a webhook must never target: the machine itself, private networks,
 * link-local ranges (cloud metadata services) and local-only DNS suffixes.
 * Keeps an admin from using the delivery log as an SSRF probe.
 */
export function isInternalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true;
  if (host.startsWith('[') || host.includes(':')) return isInternalIpv6(host);
  return isInternalIpv4(host);
}

/**
 * https is mandatory unless the installation itself runs over plain http
 * (local development); outside development the target must also be a public
 * host (see `isInternalHost`).
 */
export function isAllowedWebhookUrl(value: string, appUrl: string = env.APP_URL): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const development = appUrl.startsWith('http://');
  if (url.protocol === 'https:') return development || !isInternalHost(url.hostname);
  if (url.protocol === 'http:') return development;
  return false;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export function deliveryStatus(d: Pick<WebhookDelivery, 'deliveredAt' | 'attempts'>): DeliveryStatus {
  if (d.deliveredAt) return 'delivered';
  if (d.attempts === 0) return 'pending';
  if (d.attempts >= MAX_ATTEMPTS) return 'failed';
  return 'retrying';
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

export const webhookInputSchema = z.object({
  name: trimmed(120, 'Navnet').min(1, 'Navn må fylles ut'),
  url: z
    .string()
    .trim()
    .max(2000, 'Adressen er for lang')
    .refine((v) => isAllowedWebhookUrl(v), 'Adressen må være en gyldig https-adresse'),
  events: z
    .array(z.string())
    .transform((list) => [...new Set(list.filter(isWebhookEvent))])
    .refine((list) => list.length > 0, 'Velg minst én hendelse'),
  isActive: formBoolean.default(true),
});
export type WebhookInput = z.infer<typeof webhookInputSchema>;

/* -------------------------------------------------------------------------- */
/*  Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export type WebhookWithStats = Webhook & {
  deliveryCount: number;
  failedCount: number;
  lastDeliveryAt: Date | null;
};

export async function listWebhooks(siteId: string): Promise<WebhookWithStats[]> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.siteId, siteId))
    .orderBy(desc(webhooks.createdAt));
  if (rows.length === 0) return [];
  const stats = await db
    .select({
      webhookId: webhookDeliveries.webhookId,
      total: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${webhookDeliveries.deliveredAt} is null and ${webhookDeliveries.attempts} >= ${MAX_ATTEMPTS})::int`,
      last: sql<Date | string | null>`max(${webhookDeliveries.createdAt})`,
    })
    .from(webhookDeliveries)
    .where(
      inArray(
        webhookDeliveries.webhookId,
        rows.map((r) => r.id),
      ),
    )
    .groupBy(webhookDeliveries.webhookId);
  const byId = new Map(stats.map((s) => [s.webhookId, s]));
  return rows.map((row) => {
    const s = byId.get(row.id);
    const last = s?.last ? new Date(s.last) : null;
    return {
      ...row,
      deliveryCount: s?.total ?? 0,
      failedCount: s?.failed ?? 0,
      lastDeliveryAt: last && !Number.isNaN(last.getTime()) ? last : null,
    };
  });
}

export async function getWebhook(siteId: string, id: string): Promise<Webhook | null> {
  const [row] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.siteId, siteId), eq(webhooks.id, id)))
    .limit(1);
  return row ?? null;
}

/** Create a subscription. The secret is returned once; the UI shows it and never again. */
export async function createWebhook(
  ctx: AdminContext,
  input: unknown,
): Promise<{ webhook: Webhook; secret: string }> {
  const data = webhookInputSchema.parse(input);
  const secret = generateWebhookSecret();
  const [row] = await db
    .insert(webhooks)
    .values({
      siteId: ctx.site.id,
      name: data.name,
      url: data.url,
      secret,
      events: data.events,
      isActive: data.isActive,
      createdBy: ctx.user.id,
    })
    .returning();
  if (!row) throw new ActionError('Kunne ikke opprette webhooken.');
  await auditFromContext(ctx, {
    action: 'webhook.create',
    entityType: 'webhook',
    entityId: row.id,
    summary: `Opprettet webhook «${row.name}»`,
    data: { url: row.url, events: row.events },
  });
  return { webhook: row, secret };
}

export async function updateWebhook(ctx: AdminContext, id: string, input: unknown): Promise<Webhook> {
  const data = webhookInputSchema.parse(input);
  const [row] = await db
    .update(webhooks)
    .set({ name: data.name, url: data.url, events: data.events, isActive: data.isActive })
    .where(and(eq(webhooks.siteId, ctx.site.id), eq(webhooks.id, id)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke webhooken.');
  await auditFromContext(ctx, {
    action: 'webhook.update',
    entityType: 'webhook',
    entityId: row.id,
    summary: `Oppdaterte webhook «${row.name}»`,
    data: { url: row.url, events: row.events, isActive: row.isActive },
  });
  return row;
}

export async function setWebhookActive(ctx: AdminContext, id: string, isActive: boolean): Promise<Webhook> {
  const [row] = await db
    .update(webhooks)
    .set({ isActive })
    .where(and(eq(webhooks.siteId, ctx.site.id), eq(webhooks.id, id)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke webhooken.');
  await auditFromContext(ctx, {
    action: isActive ? 'webhook.activate' : 'webhook.deactivate',
    entityType: 'webhook',
    entityId: row.id,
    summary: `${isActive ? 'Aktiverte' : 'Deaktiverte'} webhook «${row.name}»`,
  });
  return row;
}

export async function deleteWebhook(ctx: AdminContext, id: string): Promise<void> {
  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.siteId, ctx.site.id), eq(webhooks.id, id)))
    .returning({ id: webhooks.id, name: webhooks.name });
  if (!row) throw new NotFoundError('Fant ikke webhooken.');
  await auditFromContext(ctx, {
    action: 'webhook.delete',
    entityType: 'webhook',
    entityId: row.id,
    summary: `Slettet webhook «${row.name}»`,
  });
}

/** Replace the signing secret. Returned once, like on create. */
export async function regenerateWebhookSecret(
  ctx: AdminContext,
  id: string,
): Promise<{ webhook: Webhook; secret: string }> {
  const secret = generateWebhookSecret();
  const [row] = await db
    .update(webhooks)
    .set({ secret })
    .where(and(eq(webhooks.siteId, ctx.site.id), eq(webhooks.id, id)))
    .returning();
  if (!row) throw new NotFoundError('Fant ikke webhooken.');
  await auditFromContext(ctx, {
    action: 'webhook.regenerate_secret',
    entityType: 'webhook',
    entityId: row.id,
    summary: `Genererte ny hemmelighet for webhook «${row.name}»`,
  });
  return { webhook: row, secret };
}

/* -------------------------------------------------------------------------- */
/*  Enqueue                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Queue an event for every active webhook on the site subscribed to it.
 * Never throws — a broken webhook table must not fail a publish.
 */
export async function enqueueWebhookEvent(
  siteId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await enqueueEvent(siteId, event, data);
  } catch (err) {
    console.error('[webhooks] enqueue', err);
  }
}

/** Same as enqueueWebhookEvent but throws and returns the created rows (tests, ping). */
export async function enqueueEvent(
  siteId: string,
  event: string,
  data: Record<string, unknown>,
  opts: { webhookIds?: string[] } = {},
): Promise<WebhookDelivery[]> {
  const [site] = await db
    .select({ id: sites.id, slug: sites.slug })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  if (!site) return [];
  const conditions = [eq(webhooks.siteId, siteId)];
  if (opts.webhookIds) conditions.push(inArray(webhooks.id, opts.webhookIds));
  else conditions.push(eq(webhooks.isActive, true), sql`${event} = any(${webhooks.events})`);
  const subscribers = await db
    .select({ id: webhooks.id })
    .from(webhooks)
    .where(and(...conditions));
  if (subscribers.length === 0) return [];

  const now = new Date();
  const values = subscribers.map((w) => {
    const id = randomUUID();
    return {
      id,
      webhookId: w.id,
      event,
      payload: buildPayload(site, event, data, id, now) as unknown as Record<string, unknown>,
      nextAttemptAt: now,
    };
  });
  return db.insert(webhookDeliveries).values(values).returning();
}

/* -------------------------------------------------------------------------- */
/*  Delivery                                                                   */
/* -------------------------------------------------------------------------- */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type DeliveryOutcome = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
};

/** POST one payload to one webhook. Never throws. */
export async function sendDelivery(
  webhook: Pick<Webhook, 'url' | 'secret'>,
  delivery: Pick<WebhookDelivery, 'id' | 'event' | 'payload'>,
  fetchImpl: FetchLike = fetch,
): Promise<DeliveryOutcome> {
  // Re-checked at send time so rows stored before the target rules tightened never reach an internal host.
  if (!isAllowedWebhookUrl(webhook.url)) {
    return { ok: false, statusCode: null, error: 'Adressen er ikke tillatt (intern eller usikker adresse).' };
  }
  const body = JSON.stringify(delivery.payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Desken-Webhooks/1.0',
        'x-desken-event': delivery.event,
        'x-desken-delivery': delivery.id,
        'x-desken-signature': signPayload(webhook.secret, body),
      },
      body,
      signal: controller.signal,
      redirect: 'manual',
    });
    if (res.ok) return { ok: true, statusCode: res.status, error: null };
    let snippet = '';
    try {
      snippet = (await res.text()).slice(0, 300);
    } catch {
      /* body unreadable */
    }
    return { ok: false, statusCode: res.status, error: `HTTP ${res.status}${snippet ? `: ${snippet}` : ''}` };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? `Tidsavbrudd etter ${DELIVERY_TIMEOUT_MS / 1000} s`
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, statusCode: null, error: message.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

/** Claim up to `limit` due deliveries by pushing their next attempt into the future (a lease). */
async function claimDue(limit: number, now: Date): Promise<WebhookDelivery[]> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const due = db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(
      and(
        isNull(webhookDeliveries.deliveredAt),
        lt(webhookDeliveries.attempts, MAX_ATTEMPTS),
        lte(webhookDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(limit);
  return db
    .update(webhookDeliveries)
    .set({ nextAttemptAt: leaseUntil })
    .where(inArray(webhookDeliveries.id, due))
    .returning();
}

async function recordOutcome(delivery: WebhookDelivery, outcome: DeliveryOutcome, now: Date): Promise<void> {
  const attempts = delivery.attempts + 1;
  await db
    .update(webhookDeliveries)
    .set({
      attempts,
      deliveredAt: outcome.ok ? now : null,
      nextAttemptAt: outcome.ok ? now : new Date(now.getTime() + backoffMs(attempts)),
      lastStatusCode: outcome.statusCode,
      lastError: outcome.ok ? null : outcome.error,
    })
    .where(eq(webhookDeliveries.id, delivery.id));
}

export type DeliverResult = { delivered: number; failed: number; claimed: number };

/** Deliver due rows (called by the scheduler). Inactive webhooks skip their rows until reactivated. */
export async function deliverPending(
  limit = 20,
  opts: { fetch?: FetchLike; now?: Date } = {},
): Promise<DeliverResult> {
  const now = opts.now ?? new Date();
  const claimed = await claimDue(Math.max(1, limit), now);
  if (claimed.length === 0) return { delivered: 0, failed: 0, claimed: 0 };

  const hookRows = await db
    .select()
    .from(webhooks)
    .where(inArray(webhooks.id, [...new Set(claimed.map((d) => d.webhookId))]));
  const hooks = new Map(hookRows.map((h) => [h.id, h]));

  let delivered = 0;
  let failed = 0;
  for (const delivery of claimed) {
    const hook = hooks.get(delivery.webhookId);
    if (!hook || !hook.isActive) {
      // Park the row: it becomes due again once the subscription is re-activated and the lease expires.
      await db
        .update(webhookDeliveries)
        .set({
          nextAttemptAt: new Date(now.getTime() + backoffMs(delivery.attempts)),
          lastError: 'Webhooken er deaktivert',
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      continue;
    }
    const outcome = await sendDelivery(hook, delivery, opts.fetch);
    await recordOutcome(delivery, outcome, new Date());
    if (outcome.ok) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed, claimed: claimed.length };
}

/* -------------------------------------------------------------------------- */
/*  Admin: deliveries, redeliver, test                                         */
/* -------------------------------------------------------------------------- */

export type DeliveryView = WebhookDelivery & { status: DeliveryStatus };

export async function listDeliveries(siteId: string, webhookId: string, limit = 50): Promise<DeliveryView[]> {
  const hook = await getWebhook(siteId, webhookId);
  if (!hook) throw new NotFoundError('Fant ikke webhooken.');
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows.map((r) => ({ ...r, status: deliveryStatus(r) }));
}

/** Send one delivery again right away, regardless of its schedule or attempt count. */
export async function redeliver(
  ctx: AdminContext,
  deliveryId: string,
  fetchImpl?: FetchLike,
): Promise<DeliveryView> {
  const [row] = await db
    .select({ delivery: webhookDeliveries, webhook: webhooks })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhooks.siteId, ctx.site.id)))
    .limit(1);
  if (!row) throw new NotFoundError('Fant ikke leveransen.');
  const outcome = await sendDelivery(row.webhook, row.delivery, fetchImpl);
  const now = new Date();
  const attempts = row.delivery.attempts + 1;
  const [updated] = await db
    .update(webhookDeliveries)
    .set({
      attempts,
      deliveredAt: outcome.ok ? now : null,
      nextAttemptAt: outcome.ok ? now : new Date(now.getTime() + backoffMs(attempts)),
      lastStatusCode: outcome.statusCode,
      lastError: outcome.ok ? null : outcome.error,
    })
    .where(eq(webhookDeliveries.id, row.delivery.id))
    .returning();
  await auditFromContext(ctx, {
    action: 'webhook.redeliver',
    entityType: 'webhook',
    entityId: row.webhook.id,
    summary: `Sendte leveranse på nytt til «${row.webhook.name}» (${outcome.ok ? 'ok' : 'feilet'})`,
    data: { deliveryId, statusCode: outcome.statusCode, error: outcome.error },
  });
  if (!updated) throw new NotFoundError('Fant ikke leveransen.');
  return { ...updated, status: deliveryStatus(updated) };
}

/** Enqueue and immediately send a `ping` event to one webhook (active or not). */
export async function sendTestEvent(
  ctx: AdminContext,
  webhookId: string,
  fetchImpl?: FetchLike,
): Promise<DeliveryView> {
  const hook = await getWebhook(ctx.site.id, webhookId);
  if (!hook) throw new NotFoundError('Fant ikke webhooken.');
  const [delivery] = await enqueueEvent(
    ctx.site.id,
    PING_EVENT,
    { message: 'Hei fra Desken', webhookId: hook.id, sentBy: ctx.user.name },
    { webhookIds: [hook.id] },
  );
  if (!delivery) throw new ActionError('Kunne ikke opprette testleveransen.');
  const outcome = await sendDelivery(hook, delivery, fetchImpl);
  const now = new Date();
  const [updated] = await db
    .update(webhookDeliveries)
    .set({
      // A failed ping is not retried (attempts jump to the maximum): the person testing sees the error right away.
      attempts: outcome.ok ? 1 : MAX_ATTEMPTS,
      deliveredAt: outcome.ok ? now : null,
      nextAttemptAt: now,
      lastStatusCode: outcome.statusCode,
      lastError: outcome.ok ? null : outcome.error,
    })
    .where(eq(webhookDeliveries.id, delivery.id))
    .returning();
  await auditFromContext(ctx, {
    action: 'webhook.test',
    entityType: 'webhook',
    entityId: hook.id,
    summary: `Testet webhook «${hook.name}» (${outcome.ok ? 'ok' : 'feilet'})`,
    data: { statusCode: outcome.statusCode, error: outcome.error },
  });
  if (!updated) throw new ActionError('Kunne ikke lagre testleveransen.');
  return { ...updated, status: deliveryStatus(updated) };
}

/** Ids of webhook rows a delivery id belongs to (used by the tick summary and tests). */
export async function pendingDeliveryCount(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookDeliveries)
    .where(and(isNull(webhookDeliveries.deliveredAt), sql`${webhookDeliveries.attempts} < ${MAX_ATTEMPTS}`));
  return row?.n ?? 0;
}

export { uuidSchema as webhookIdSchema };
