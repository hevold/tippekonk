import { beforeAll, describe, expect, it, vi } from 'vitest';

import { articles, media, type Media } from '@/db/schema';
import { seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));

import {
  countTrashedMedia,
  getMedia,
  getMediaMany,
  listFolders,
  listMedia,
  mediaUsage,
  mediaUsageCounts,
} from './queries';

let seeded: SeedMinimalResult;
let rows: Media[];

beforeAll(async () => {
  const db = await useTestDb();
  seeded = await seedMinimal(db);
  const site = seeded.site.id;
  const at = (i: number) => new Date(Date.UTC(2026, 0, 1 + i));
  const specs = Array.from({ length: 45 }, (_, i) => ({
    siteId: site,
    kind: i % 9 === 0 ? ('document' as const) : ('image' as const),
    filename: i % 9 === 0 ? `rapport-${i}.pdf` : `bilde-${i}.jpg`,
    storageKey: `2026/01/${String(i).padStart(4, '0')}.${i % 9 === 0 ? 'pdf' : 'jpg'}`,
    mime: i % 9 === 0 ? 'application/pdf' : 'image/jpeg',
    size: 1000 + i,
    width: i % 9 === 0 ? null : 1600,
    height: i % 9 === 0 ? null : 1000,
    alt: i === 3 ? 'Elvebyen rådhus i 100% sol' : `Bilde nummer ${i}`,
    caption: i === 5 ? 'Kommunestyret møtes' : null,
    credit: i === 7 ? 'Foto: NTB' : null,
    folder: i < 10 ? 'Sport' : i < 20 ? 'Nyheter' : null,
    tags: i === 11 ? ['fotball', 'cup'] : [],
    uploadedBy: seeded.editor.id,
    createdAt: at(i),
    updatedAt: at(i),
    deletedAt: i >= 42 ? at(i) : null,
  }));
  rows = await db.insert(media).values(specs).returning();
  // Another site's media must never leak.
  const [otherSite] = await db
    .insert((await import('@/db/schema')).sites)
    .values({ slug: 'annen', name: 'Annen avis', domains: ['annen.local'], settings: {} as never })
    .returning();
  await db.insert(media).values({
    siteId: otherSite!.id,
    kind: 'image',
    filename: 'fremmed.jpg',
    storageKey: '2026/01/fremmed.jpg',
    mime: 'image/jpeg',
    size: 1,
    alt: 'Bilde nummer 1',
  });
});

describe('listMedia', () => {
  it('pages newest first, 40 per page, excluding trashed items', async () => {
    const page1 = await listMedia(seeded.site.id, {});
    expect(page1.total).toBe(42);
    expect(page1.pageCount).toBe(2);
    expect(page1.perPage).toBe(40);
    expect(page1.items).toHaveLength(40);
    expect(page1.items[0]?.filename).toBe('bilde-41.jpg');
    expect(page1.items.every((m) => m.deletedAt === null)).toBe(true);

    const page2 = await listMedia(seeded.site.id, { page: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[1]?.storageKey).toBe('2026/01/0000.pdf');

    // Out-of-range pages clamp to the last page instead of returning nothing.
    const page9 = await listMedia(seeded.site.id, { page: 9 });
    expect(page9.page).toBe(2);
    expect(page9.items).toHaveLength(2);
  });

  it('searches filename, alt, caption, credit and tags case-insensitively', async () => {
    expect((await listMedia(seeded.site.id, { q: 'RÅDHUS' })).items.map((m) => m.filename)).toEqual([
      'bilde-3.jpg',
    ]);
    expect((await listMedia(seeded.site.id, { q: 'kommunestyret' })).items.map((m) => m.filename)).toEqual([
      'bilde-5.jpg',
    ]);
    expect((await listMedia(seeded.site.id, { q: 'ntb' })).items.map((m) => m.filename)).toEqual([
      'bilde-7.jpg',
    ]);
    expect((await listMedia(seeded.site.id, { q: 'cup' })).items.map((m) => m.filename)).toEqual([
      'bilde-11.jpg',
    ]);
    expect((await listMedia(seeded.site.id, { q: 'rapport-' })).total).toBe(5);
    // LIKE wildcards in the query are literal: only the one alt text containing "%" matches.
    expect((await listMedia(seeded.site.id, { q: '100%' })).total).toBe(1);
    expect((await listMedia(seeded.site.id, { q: '%' })).total).toBe(1);
    expect((await listMedia(seeded.site.id, { q: '_' })).total).toBe(0);
    expect((await listMedia(seeded.site.id, { q: 'finnes ikke' })).total).toBe(0);
  });

  it('filters by kind, folder and trash', async () => {
    expect((await listMedia(seeded.site.id, { kind: 'document' })).total).toBe(5);
    expect((await listMedia(seeded.site.id, { kind: 'image' })).total).toBe(37);
    expect((await listMedia(seeded.site.id, { folder: 'Sport' })).total).toBe(10);
    expect((await listMedia(seeded.site.id, { folder: 'Sport', kind: 'document' })).total).toBe(2);
    const trash = await listMedia(seeded.site.id, { trashed: true });
    expect(trash.total).toBe(3);
    expect(trash.items.every((m) => m.deletedAt !== null)).toBe(true);
    expect(await countTrashedMedia(seeded.site.id)).toBe(3);
  });

  it('is scoped to the site', async () => {
    const hits = await listMedia(seeded.site.id, { q: 'Bilde nummer 1' });
    expect(hits.items.some((m) => m.filename === 'fremmed.jpg')).toBe(false);
  });
});

describe('getMedia / getMediaMany / listFolders', () => {
  it('fetches by id within the site (including trashed for the detail page)', async () => {
    const live = rows[0]!;
    const trashed = rows[44]!;
    expect((await getMedia(seeded.site.id, live.id))?.id).toBe(live.id);
    expect((await getMedia(seeded.site.id, trashed.id))?.deletedAt).not.toBeNull();
    expect(await getMedia('00000000-0000-4000-8000-000000000000', live.id)).toBeNull();
  });

  it('maps many ids, skipping trashed and unknown ones', async () => {
    const map = await getMediaMany(seeded.site.id, [
      rows[1]!.id,
      rows[44]!.id,
      rows[1]!.id,
      '00000000-0000-4000-8000-000000000000',
    ]);
    expect([...map.keys()]).toEqual([rows[1]!.id]);
    expect((await getMediaMany(seeded.site.id, [])).size).toBe(0);
  });

  it('lists folders with counts', async () => {
    expect(await listFolders(seeded.site.id)).toEqual([
      { name: 'Nyheter', count: 10 },
      { name: 'Sport', count: 10 },
    ]);
  });
});

describe('mediaUsage', () => {
  it('finds articles using the file as featured image or inside the body', async () => {
    const db = await useTestDb();
    const featured = rows[1]!;
    const inBody = rows[2]!;
    const [a1] = await db
      .insert(articles)
      .values({
        siteId: seeded.site.id,
        contentTypeId: seeded.contentType.id,
        sectionId: seeded.section.id,
        title: 'Hovedbilde-sak',
        slug: 'hovedbilde-sak',
        featuredMediaId: featured.id,
        createdBy: seeded.editor.id,
      })
      .returning();
    const [a2] = await db
      .insert(articles)
      .values({
        siteId: seeded.site.id,
        contentTypeId: seeded.contentType.id,
        title: 'Brødtekst-sak',
        slug: 'brodtekst-sak',
        body: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: inBody.id, alt: 'x' } }] },
        status: 'published',
        createdBy: seeded.editor.id,
      })
      .returning();
    await db.insert(articles).values({
      siteId: seeded.site.id,
      contentTypeId: seeded.contentType.id,
      title: 'Slettet sak',
      slug: 'slettet-sak',
      featuredMediaId: featured.id,
      deletedAt: new Date(),
    });

    const usedAsFeatured = await mediaUsage(seeded.site.id, featured.id);
    expect(usedAsFeatured).toEqual([
      { id: a1!.id, title: 'Hovedbilde-sak', status: 'draft', featured: true, inBody: false },
    ]);

    const usedInBody = await mediaUsage(seeded.site.id, inBody.id);
    expect(usedInBody).toEqual([
      { id: a2!.id, title: 'Brødtekst-sak', status: 'published', featured: false, inBody: true },
    ]);

    expect(await mediaUsage(seeded.site.id, rows[3]!.id)).toEqual([]);
    const counts = await mediaUsageCounts(seeded.site.id, [featured.id, inBody.id, rows[3]!.id]);
    expect([...counts.entries()]).toEqual([
      [featured.id, 1],
      [inBody.id, 1],
    ]);
  });
});
