import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { auditLog, media, type Media } from '@/db/schema';
import type { Permission } from '@/lib/permissions';
import { ForbiddenError } from '@/server/actions';
import { seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

// The actions read the signed-in user from cookies; substitute a controllable context.
const fake = { permissions: new Set<Permission>(), ctx: null as null | Record<string, unknown> };
vi.mock('@/server/auth/guards', () => ({
  requirePermission: async (permission: Permission) => {
    if (!fake.ctx) throw new Error('test: context not ready');
    if (!fake.permissions.has(permission)) throw new ForbiddenError();
    return fake.ctx;
  },
}));

import {
  destroyMedia,
  getMediaUsageAction,
  listMediaAction,
  restoreMedia,
  setFocalPoint,
  trashMedia,
  updateMediaMeta,
} from './actions';
import { ingestUpload } from './processing';
import { LocalStorageAdapter, setStorage } from './storage';
import { sortedVariants } from './urls';

let seeded: SeedMinimalResult;
let root: string;
let storage: LocalStorageAdapter;
let image: Media;

const ALL: Permission[] = ['admin:access', 'media:upload', 'media:edit', 'media:delete'];

beforeAll(async () => {
  const db = await useTestDb();
  seeded = await seedMinimal(db);
  root = await mkdtemp(path.join(tmpdir(), 'desken-actions-'));
  storage = new LocalStorageAdapter(root);
  setStorage(storage);
  fake.ctx = {
    user: seeded.editor,
    site: seeded.site,
    ip: '127.0.0.1',
    can: (p: Permission) => fake.permissions.has(p),
  };
  fake.permissions = new Set(ALL);
  const buffer = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#224488' } })
    .png()
    .toBuffer();
  image = await ingestUpload({
    siteId: seeded.site.id,
    userId: seeded.editor.id,
    filename: 'bilde.png',
    mime: 'image/png',
    buffer,
    alt: 'Første alt',
    credit: 'Foto: A',
    folder: 'Sport',
  });
  await db
    .update(media)
    .set({ tags: ['fotball'], license: 'CC BY', focalX: 0.2, focalY: 0.8 })
    .where(eq(media.id, image.id));
});

afterAll(async () => {
  setStorage(null);
  await rm(root, { recursive: true, force: true });
});

describe('updateMediaMeta', () => {
  it('only writes the fields that were sent (partial update keeps folder, tags, license, focal point)', async () => {
    const result = await updateMediaMeta({ id: image.id, alt: 'Ny alt', credit: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.alt).toBe('Ny alt');
    expect(result.data.credit).toBeNull();
    expect(result.data.folder).toBe('Sport');
    expect(result.data.tags).toEqual(['fotball']);
    expect(result.data.license).toBe('CC BY');
    expect(result.data.focalX).toBeCloseTo(0.2);
    expect(result.data.focalY).toBeCloseTo(0.8);
  });

  it('normalises tags and dates, validates input and audits', async () => {
    const result = await updateMediaMeta({
      id: image.id,
      tags: ['Fotball', ' cup ', 'fotball'],
      takenAt: '2026-06-01T10:00:00.000Z',
      sourceUrl: 'https://example.no/foto',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tags).toEqual(['fotball', 'cup']);
    expect(result.data.takenAt?.toISOString()).toBe('2026-06-01T10:00:00.000Z');
    expect(result.data.sourceUrl).toBe('https://example.no/foto');

    const invalid = await updateMediaMeta({ id: image.id, alt: 'x'.repeat(1001) });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe('validation');

    const db = await useTestDb();
    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, image.id));
    expect(entries.some((e) => e.action === 'media.update')).toBe(true);
  });

  it('refuses without media:edit and for another site', async () => {
    fake.permissions = new Set(['admin:access']);
    const denied = await updateMediaMeta({ id: image.id, alt: 'x' });
    expect(denied).toMatchObject({ ok: false, code: 'forbidden' });
    fake.permissions = new Set(ALL);

    const missing = await updateMediaMeta({ id: '00000000-0000-4000-8000-000000000000', alt: 'x' });
    expect(missing).toMatchObject({ ok: false, code: 'not_found' });
  });
});

describe('setFocalPoint', () => {
  it('stores a clamped focal point', async () => {
    const ok = await setFocalPoint({ id: image.id, focalX: 0.25, focalY: '0.75' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect([ok.data.focalX, ok.data.focalY]).toEqual([0.25, 0.75]);
    const bad = await setFocalPoint({ id: image.id, focalX: 1.5, focalY: 0 });
    expect(bad).toMatchObject({ ok: false, code: 'validation' });
  });
});

describe('listMediaAction / getMediaUsageAction', () => {
  it('lists with the filter schema defaults and reports usage', async () => {
    const result = await listMediaAction({ q: 'bilde' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.perPage).toBe(40);
      expect(result.data.items.map((m) => m.id)).toContain(image.id);
    }
    const usage = await getMediaUsageAction(image.id);
    expect(usage).toEqual({ ok: true, data: [] });
  });
});

describe('trash → restore → destroy', () => {
  it('soft-deletes, restores and finally removes the row and its files', async () => {
    const trashed = await trashMedia([image.id]);
    expect(trashed).toEqual({ ok: true, data: { count: 1 } });
    // Trashed items disappear from the library listing…
    const listed = await listMediaAction({});
    if (listed.ok) expect(listed.data.items.some((m) => m.id === image.id)).toBe(false);
    // …and cannot be destroyed twice or trashed again.
    expect(await trashMedia([image.id])).toEqual({ ok: true, data: { count: 0 } });

    const restored = await restoreMedia([image.id]);
    expect(restored).toEqual({ ok: true, data: { count: 1 } });

    // Live items are never destroyed outright: they must be in the trash first.
    expect(await destroyMedia([image.id])).toEqual({ ok: true, data: { count: 0 } });
    expect(await storage.head(image.storageKey)).not.toBeNull();

    await trashMedia([image.id]);
    const destroyed = await destroyMedia([image.id]);
    expect(destroyed).toEqual({ ok: true, data: { count: 1 } });
    const db = await useTestDb();
    expect(await db.select().from(media).where(eq(media.id, image.id))).toEqual([]);
    expect(await storage.head(image.storageKey)).toBeNull();
    for (const v of sortedVariants(image.variants)) expect(await storage.head(v.key)).toBeNull();
  });

  it('requires media:delete', async () => {
    fake.permissions = new Set(['admin:access', 'media:edit']);
    expect(await trashMedia([image.id])).toMatchObject({ ok: false, code: 'forbidden' });
    expect(await destroyMedia([image.id])).toMatchObject({ ok: false, code: 'forbidden' });
    fake.permissions = new Set(ALL);
    expect(await trashMedia('not-a-uuid')).toMatchObject({ ok: false, code: 'validation' });
  });
});
