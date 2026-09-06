import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import {
  articles,
  auditLog,
  layouts,
  webhookDeliveries,
  webhooks,
  type MemberRole,
  type User,
} from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import { discardDraft, getLayout, listLayouts, publishLayout, saveDraft, sectionLayoutKey } from './index';
import { resolveDraftPreview } from './preview';

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

async function insertArticle(input: {
  title: string;
  status: 'published' | 'scheduled' | 'draft';
  when?: Date;
  sponsored?: boolean;
}) {
  const [row] = await db
    .insert(articles)
    .values({
      siteId: seed.site.id,
      contentTypeId: seed.contentType.id,
      sectionId: seed.section.id,
      title: input.title,
      slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      status: input.status,
      publishedAt: input.status === 'published' ? (input.when ?? new Date(Date.now() - 60_000)) : null,
      scheduledAt: input.status === 'scheduled' ? (input.when ?? new Date(Date.now() + 3_600_000)) : null,
      isSponsored: input.sponsored ?? false,
      createdBy: seed.editor.id,
    })
    .returning();
  return row!;
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('layouts', () => {
  it('creates the front layout on demand from the default and lists sections', async () => {
    const layout = await getLayout(seed.site.id, 'front');
    expect(layout.name).toBe('Forside');
    expect(layout.draft.rows.length).toBeGreaterThan(2);
    expect(layout.published).toBeNull();
    const again = await getLayout(seed.site.id, 'front');
    expect(again.id).toBe(layout.id);

    const list = await listLayouts(seed.site.id);
    expect(list[0]).toMatchObject({ key: 'front', exists: true, isPublished: false, hasDraftChanges: true });
    expect(list.find((l) => l.key === sectionLayoutKey(seed.section.id))).toMatchObject({
      exists: false,
      name: 'Nyheter',
    });
    await expect(getLayout(seed.site.id, 'section:not-a-uuid')).rejects.toThrow();
  });

  it('validates the draft document before saving', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    await expect(saveDraft(ctx, 'front', { version: 2, rows: [] })).rejects.toThrow();
    await expect(
      saveDraft(ctx, 'front', { version: 1, rows: [{ id: 'r', kind: 'row', columns: 5, blocks: [] }] }),
    ).rejects.toThrow();
    const saved = await saveDraft(ctx, 'front', {
      version: 1,
      rows: [
        { id: 'r1', kind: 'row', columns: 1, blocks: [{ id: 'b1', type: 'latest', settings: { limit: 3 } }] },
      ],
    });
    expect(saved.draft.rows).toHaveLength(1);
    expect(saved.updatedBy).toBe(seed.editor.id);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'layout.save_draft'));
    expect(audits).toHaveLength(1);
  });

  it('publishes the draft, audits, and enqueues layout.published for subscribed webhooks', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    await db.insert(webhooks).values({
      siteId: seed.site.id,
      name: 'hook',
      url: 'https://example.com/h',
      secret: 's',
      events: ['layout.published'],
      isActive: true,
    });
    await expect(publishLayout(ctx, 'front')).resolves.toMatchObject({ key: 'front' });
    const row = (await db.select().from(layouts).where(eq(layouts.siteId, seed.site.id)))[0]!;
    expect(row.published).toEqual(row.draft);
    expect(row.publishedAt).toBeInstanceOf(Date);
    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.event).toBe('layout.published');
    expect((deliveries[0]!.payload as { data: { key: string } }).data.key).toBe('front');
    const list = await listLayouts(seed.site.id);
    expect(list[0]).toMatchObject({ isPublished: true, hasDraftChanges: false });

    await expect(saveDraft(ctx, 'front', { version: 1, rows: [] })).resolves.toBeTruthy();
    await expect(publishLayout(ctx, 'front')).rejects.toThrow(/tom/i);
  });

  it('discards the draft back to the published document', async () => {
    const ctx = ctxFor(seed.editor, 'editor');
    await publishLayout(ctx, 'front');
    await saveDraft(ctx, 'front', { version: 1, rows: [{ id: 'x', kind: 'row', columns: 1, blocks: [] }] });
    const restored = await discardDraft(ctx, 'front');
    expect(restored.draft).toEqual(restored.published);
  });

  it('previews pinned scheduled articles and auto-fills published ones without sponsored', async () => {
    const published = await insertArticle({ title: 'Publisert sak', status: 'published' });
    const scheduled = await insertArticle({ title: 'Planlagt sak', status: 'scheduled' });
    await insertArticle({ title: 'Sponset', status: 'published', sponsored: true });
    await insertArticle({ title: 'Utkast', status: 'draft' });
    const preview = await resolveDraftPreview(seed.site.id, {
      version: 1,
      rows: [
        {
          id: 'r1',
          kind: 'row',
          columns: 1,
          blocks: [
            {
              id: 'hero',
              type: 'hero',
              settings: {},
              items: [{ articleId: scheduled.id, overrides: { title: 'Egen tittel' } }],
            },
          ],
        },
        {
          id: 'r2',
          kind: 'row',
          columns: 1,
          blocks: [{ id: 'list', type: 'list', settings: { limit: 10 } }],
        },
      ],
    });
    const hero = preview.rows[0]!.blocks[0]!;
    expect(hero.articles).toHaveLength(1);
    expect(hero.articles[0]).toMatchObject({
      id: scheduled.id,
      title: 'Egen tittel',
      status: 'scheduled',
      pinned: true,
    });
    const list = preview.rows[1]!.blocks[0]!;
    expect(list.articles.map((a) => a.id)).toEqual([published.id]);
  });
});
