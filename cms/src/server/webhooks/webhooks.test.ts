import { createHmac } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import { webhookDeliveries, webhooks, type MemberRole, type User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  backoffMs,
  createWebhook,
  deliverPending,
  deliveryStatus,
  enqueueEvent,
  enqueueWebhookEvent,
  isAllowedWebhookUrl,
  listDeliveries,
  MAX_ATTEMPTS,
  redeliver,
  sendTestEvent,
  signPayload,
  type FetchLike,
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

function fetchStub(status: number, calls: { url: string; init: RequestInit }[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const body = status === 204 || status === 205 || status === 304 ? null : status >= 400 ? 'nope' : 'ok';
    return new Response(body, { status });
  };
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('webhooks: pure helpers', () => {
  it('computes exponential backoff capped at the max attempt count', () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(1)).toBe(120_000);
    expect(backoffMs(3)).toBe(480_000);
    expect(backoffMs(MAX_ATTEMPTS)).toBe(60_000 * 2 ** MAX_ATTEMPTS);
    expect(backoffMs(MAX_ATTEMPTS + 5)).toBe(backoffMs(MAX_ATTEMPTS));
  });

  it('signs the raw body with HMAC-SHA256', () => {
    const body = '{"a":1}';
    const expected = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(signPayload('secret', body)).toBe(expected);
    expect(signPayload('other', body)).not.toBe(expected);
  });

  it('requires https unless the installation runs on http', () => {
    expect(isAllowedWebhookUrl('https://example.com/x', 'https://avis.no')).toBe(true);
    expect(isAllowedWebhookUrl('http://example.com/x', 'https://avis.no')).toBe(false);
    expect(isAllowedWebhookUrl('http://localhost:4000/x', 'http://localhost:3000')).toBe(true);
    expect(isAllowedWebhookUrl('ftp://example.com', 'http://localhost:3000')).toBe(false);
    expect(isAllowedWebhookUrl('not a url', 'http://localhost:3000')).toBe(false);
  });

  it('derives delivery status', () => {
    expect(deliveryStatus({ deliveredAt: null, attempts: 0 })).toBe('pending');
    expect(deliveryStatus({ deliveredAt: new Date(), attempts: 1 })).toBe('delivered');
    expect(deliveryStatus({ deliveredAt: null, attempts: 2 })).toBe('retrying');
    expect(deliveryStatus({ deliveredAt: null, attempts: MAX_ATTEMPTS })).toBe('failed');
  });
});

describe('webhooks: enqueue and delivery', () => {
  it('enqueues one delivery per active subscribed webhook', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    const { webhook: a } = await createWebhook(ctx, {
      name: 'A',
      url: 'https://a.example/h',
      events: ['article.published'],
    });
    await createWebhook(ctx, { name: 'B', url: 'https://b.example/h', events: ['layout.published'] });
    await createWebhook(ctx, {
      name: 'C',
      url: 'https://c.example/h',
      events: ['article.published'],
      isActive: false,
    });
    await expect(
      createWebhook(ctx, { name: 'D', url: 'ftp://plain.example', events: ['article.published'] }),
    ).rejects.toThrow();
    await expect(
      createWebhook(ctx, { name: 'E', url: 'https://e.example', events: ['bogus.event'] }),
    ).rejects.toThrow();

    await enqueueWebhookEvent(seed.site.id, 'article.published', { id: 'x', title: 'Sak' });
    const rows = await db.select().from(webhookDeliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.webhookId).toBe(a.id);
    const payload = rows[0]!.payload as {
      id: string;
      event: string;
      site: { slug: string };
      data: { title: string };
    };
    expect(payload.id).toBe(rows[0]!.id);
    expect(payload.event).toBe('article.published');
    expect(payload.site.slug).toBe(seed.site.slug);
    expect(payload.data.title).toBe('Sak');
  });

  it('delivers with signature headers and records success', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    const { webhook, secret } = await createWebhook(ctx, {
      name: 'A',
      url: 'https://a.example/h',
      events: ['article.published'],
    });
    await enqueueEvent(seed.site.id, 'article.published', { id: '1' });
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await deliverPending(10, { fetch: fetchStub(200, calls) });
    expect(result).toEqual({ delivered: 1, failed: 0, claimed: 1 });
    expect(calls[0]!.url).toBe(webhook.url);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['x-desken-event']).toBe('article.published');
    expect(headers['x-desken-signature']).toBe(signPayload(secret, String(calls[0]!.init.body)));
    expect(headers['x-desken-delivery']).toBeTruthy();
    const [row] = await db.select().from(webhookDeliveries);
    expect(row!.deliveredAt).toBeInstanceOf(Date);
    expect(row!.lastStatusCode).toBe(200);
    // Nothing left to claim.
    expect(await deliverPending(10, { fetch: fetchStub(200) })).toEqual({
      delivered: 0,
      failed: 0,
      claimed: 0,
    });
  });

  it('retries with backoff and gives up after MAX_ATTEMPTS', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    await createWebhook(ctx, { name: 'A', url: 'https://a.example/h', events: ['article.published'] });
    await enqueueEvent(seed.site.id, 'article.published', { id: '1' });
    const first = await deliverPending(10, { fetch: fetchStub(500) });
    expect(first).toEqual({ delivered: 0, failed: 1, claimed: 1 });
    let [row] = await db.select().from(webhookDeliveries);
    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toMatch(/HTTP 500/);
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(Date.now() + backoffMs(1) - 5_000);
    // Not due yet.
    expect((await deliverPending(10, { fetch: fetchStub(500) })).claimed).toBe(0);
    // Force through the remaining attempts.
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await db
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(0) })
        .where(eq(webhookDeliveries.id, row!.id));
      await deliverPending(10, { fetch: fetchStub(503) });
    }
    [row] = await db.select().from(webhookDeliveries);
    expect(row!.attempts).toBe(MAX_ATTEMPTS);
    expect(deliveryStatus(row!)).toBe('failed');
    await db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(webhookDeliveries.id, row!.id));
    expect((await deliverPending(10, { fetch: fetchStub(200) })).claimed).toBe(0);

    // Manual redelivery still works and succeeds.
    const redelivered = await redeliver(ctx, row!.id, fetchStub(200));
    expect(redelivered.status).toBe('delivered');
  });

  it('records timeouts and network errors without throwing', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    await createWebhook(ctx, { name: 'A', url: 'https://a.example/h', events: ['article.published'] });
    await enqueueEvent(seed.site.id, 'article.published', { id: '1' });
    const failing: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await deliverPending(10, { fetch: failing })).toMatchObject({ failed: 1 });
    const [row] = await db.select().from(webhookDeliveries);
    expect(row!.lastError).toBe('ECONNREFUSED');
    expect(row!.lastStatusCode).toBeNull();
  });

  it('sends a ping for "Test" and lists deliveries newest first', async () => {
    const ctx = ctxFor(seed.admin, 'admin');
    const { webhook } = await createWebhook(ctx, {
      name: 'A',
      url: 'https://a.example/h',
      events: ['article.published'],
      isActive: false,
    });
    const ok = await sendTestEvent(ctx, webhook.id, fetchStub(204));
    expect(ok.status).toBe('delivered');
    expect(ok.event).toBe('ping');
    const failed = await sendTestEvent(ctx, webhook.id, fetchStub(404));
    expect(failed.status).toBe('failed');
    const list = await listDeliveries(seed.site.id, webhook.id);
    expect(list.map((d) => d.id)).toEqual([failed.id, ok.id]);
    const hooks = await db.select().from(webhooks);
    expect(hooks).toHaveLength(1);
  });
});
