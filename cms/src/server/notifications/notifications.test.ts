import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Db } from '@/db';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

import { countUnread, deleteNotification, listNotifications, markRead, notify } from './index';

let db: Db;
let seed: SeedMinimalResult;

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

describe('notifications', () => {
  it('fans out to several users (deduplicated) and lists newest first', async () => {
    await notify([seed.editor.id, seed.journalist.id, seed.editor.id], {
      siteId: seed.site.id,
      kind: 'article.review_requested',
      title: 'Ny sak til desk',
      body: 'Kari sendte «Budsjettet» til gjennomsyn',
      link: '/admin/artikler/x',
    });
    await notify([seed.editor.id], { kind: 'article.published', title: 'Publisert' });

    const editorItems = await listNotifications(seed.editor.id);
    expect(editorItems.map((n) => n.title)).toEqual(['Publisert', 'Ny sak til desk']);
    expect(await listNotifications(seed.journalist.id)).toHaveLength(1);
    expect(await listNotifications(seed.admin.id)).toHaveLength(0);
    expect(await countUnread(seed.editor.id)).toBe(2);
    expect(await notify([], { kind: 'x', title: 'y' })).toBeUndefined();
  });

  it('marks specific ids or all as read, only for the owner', async () => {
    await notify([seed.editor.id, seed.journalist.id], { kind: 'article.note', title: 'Kommentar' });
    const editorItems = await listNotifications(seed.editor.id);
    const journalistItems = await listNotifications(seed.journalist.id);

    // The editor cannot mark the journalist's row.
    await markRead(seed.editor.id, [journalistItems[0]!.id]);
    expect(await countUnread(seed.journalist.id)).toBe(1);

    await markRead(seed.editor.id, [editorItems[0]!.id]);
    expect(await countUnread(seed.editor.id)).toBe(0);
    expect(await listNotifications(seed.editor.id, { unreadOnly: true })).toHaveLength(0);

    await notify([seed.journalist.id], { kind: 'article.note', title: 'Enda en' });
    await markRead(seed.journalist.id, 'all');
    expect(await countUnread(seed.journalist.id)).toBe(0);
  });

  it('deletes only the owner’s notification', async () => {
    await notify([seed.editor.id], { kind: 'x', title: 'Slett meg' });
    const [item] = await listNotifications(seed.editor.id);
    await deleteNotification(seed.journalist.id, item!.id);
    expect(await listNotifications(seed.editor.id)).toHaveLength(1);
    await deleteNotification(seed.editor.id, item!.id);
    expect(await listNotifications(seed.editor.id)).toHaveLength(0);
  });
});
