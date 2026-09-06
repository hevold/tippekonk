import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Db } from '@/db';
import {
  articleBylines,
  articleRevisions,
  articleTags,
  articles,
  auditLog,
  media,
  notifications,
  redirects,
  type MemberRole,
  type User,
} from '@/db/schema';
import type { ContentDoc } from '@/lib/content/types';
import { can, type Permission } from '@/lib/permissions';
import type { ArticleInputRaw } from '@/lib/validation/article';
import { parseSiteSettings } from '@/lib/validation/site';
import { ActionError, ConflictError, ForbiddenError } from '@/server/actions';
import type { AdminContext } from '@/server/auth/context';
import { resetTestDb, seedMinimal, useTestDb, type SeedMinimalResult } from '@/test/db';

vi.mock('server-only', () => ({}));
// guards.ts pulls in next/headers; the service only needs assertCan, which is pure.
vi.mock('@/server/auth/guards', () => ({
  assertCan: (ctx: { can: (p: Permission) => boolean }, permission: Permission) => {
    if (!ctx.can(permission)) throw new ForbiddenError();
  },
  requirePermission: async () => {
    throw new Error('requirePermission is not available in service tests');
  },
}));

import { getArticleForEdit } from './queries';
import { AUTOSAVE_KEEP, listRevisions } from './revisions';
import {
  addNote,
  assignArticle,
  changeContentType,
  createArticle,
  diffRevisions,
  duplicateArticle,
  getPublishIssues,
  publishArticle,
  restoreArticle,
  restoreRevision,
  saveArticle,
  scheduleArticle,
  toggleChecklistItem,
  transition,
  trashArticle,
  unpublishArticle,
} from './service';
import { checklistFlag } from './validation';

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

const editor = () => ctxFor(seed.editor, 'editor');
const journalist = () => ctxFor(seed.journalist, 'journalist');
const contributor = () => ctxFor(seed.contributor, 'contributor');

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const body = (...texts: string[]): ContentDoc => ({ type: 'doc', content: texts.map(paragraph) });

function checklistDone(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const item of parseSiteSettings({}).checklist.items) flags[checklistFlag(item.id)] = true;
  return flags;
}

/** A complete, publishable payload; override what the test cares about. */
function publishable(overrides: Partial<ArticleInputRaw> = {}): ArticleInputRaw {
  return {
    title: 'Kommunestyret vedtok budsjettet',
    lead: 'Flertallet stemte for etter fem timers debatt.',
    sectionId: seed.section.id,
    body: body('Første avsnitt.', 'Andre avsnitt.'),
    bylines: [{ authorId: seed.authors.journalist.id, role: 'text' }],
    tagIds: [seed.tags[0]!.id],
    flags: checklistDone(),
    ...overrides,
  };
}

async function insertMedia(alt: string | null, credit: string | null = 'Foto: Test'): Promise<string> {
  const [row] = await db
    .insert(media)
    .values({
      siteId: seed.site.id,
      filename: 'bilde.jpg',
      storageKey: `2026/09/${crypto.randomUUID()}.jpg`,
      mime: 'image/jpeg',
      size: 1234,
      width: 800,
      height: 600,
      alt,
      credit,
    })
    .returning({ id: media.id });
  return row!.id;
}

async function revisionKinds(articleId: string): Promise<string[]> {
  const rows = await db
    .select({ kind: articleRevisions.kind, version: articleRevisions.version })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(articleRevisions.version);
  return rows.map((r) => `${r.version}:${r.kind}`);
}

beforeAll(async () => {
  db = await useTestDb();
});

beforeEach(async () => {
  await resetTestDb();
  seed = await seedMinimal(db);
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/*  Create and save                                                            */
/* -------------------------------------------------------------------------- */

describe('createArticle / saveArticle', () => {
  it('creates a draft with a placeholder slug, then saves with slug from the title and a revision per manual save', async () => {
    const ctx = journalist();
    const created = await createArticle(ctx);
    expect(created).toMatchObject({
      status: 'draft',
      version: 1,
      createdBy: seed.journalist.id,
      contentTypeId: seed.contentType.id,
    });
    expect(created.slug).toMatch(/^utkast-[a-z0-9]+$/);
    expect(await revisionKinds(created.id)).toEqual(['1:manual']);

    const saved = await saveArticle(ctx, created.id, publishable({ title: 'Blåbær på Storåsen' }), {
      expectedVersion: 1,
      kind: 'manual',
    });
    expect(saved.version).toBe(2);
    expect(saved.article.slug).toBe('blabaer-pa-storasen');
    expect(saved.article.wordCount).toBe(4);
    expect(saved.article.readingTimeMin).toBe(1);
    expect(saved.article.bodyText).toContain('Første avsnitt.');
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '2:manual']);

    const again = await saveArticle(
      ctx,
      created.id,
      publishable({ title: 'Blåbær på Storåsen', lead: 'Ny ingress' }),
      {
        expectedVersion: 2,
        kind: 'manual',
      },
    );
    expect(again.version).toBe(3);
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '2:manual', '3:manual']);

    const tags = await db.select().from(articleTags).where(eq(articleTags.articleId, created.id));
    const bylines = await db.select().from(articleBylines).where(eq(articleBylines.articleId, created.id));
    expect(tags.map((t) => t.tagId)).toEqual([seed.tags[0]!.id]);
    expect(bylines.map((b) => b.authorId)).toEqual([seed.authors.journalist.id]);
  });

  it('rejects a save with a stale version (optimistic locking)', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, { title: 'Sak' });
    await saveArticle(ctx, created.id, publishable(), { expectedVersion: 1, kind: 'manual' });
    await expect(
      saveArticle(journalist(), created.id, publishable({ title: 'Kolliderer' }), {
        expectedVersion: 1,
        kind: 'manual',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [row] = await db
      .select({ title: articles.title, version: articles.version })
      .from(articles)
      .where(eq(articles.id, created.id));
    expect(row).toEqual({ title: 'Kommunestyret vedtok budsjettet', version: 2 });
  });

  it('makes slugs unique per site and honours explicit slugs', async () => {
    const ctx = editor();
    const a = await createArticle(ctx, { title: 'Samme tittel' });
    const b = await createArticle(ctx, { title: 'Samme tittel' });
    expect(a.slug).toBe('samme-tittel');
    expect(b.slug).toBe('samme-tittel-2');

    const c = await createArticle(ctx, { title: 'Annen', slug: 'samme-tittel' });
    expect(c.slug).toBe('samme-tittel-3');

    // Saving with an explicit slug locks it; later title changes no longer regenerate it.
    const saved = await saveArticle(
      ctx,
      a.id,
      publishable({ title: 'Helt ny tittel', slug: 'egen-adresse' }),
      {
        expectedVersion: 1,
        kind: 'manual',
      },
    );
    expect(saved.article.slug).toBe('egen-adresse');
    const next = await saveArticle(
      ctx,
      a.id,
      publishable({ title: 'Enda en tittel', slug: 'egen-adresse' }),
      {
        expectedVersion: 2,
        kind: 'manual',
      },
    );
    expect(next.article.slug).toBe('egen-adresse');
  });

  it('lets contributors edit only their own articles', async () => {
    const own = await createArticle(contributor(), { title: 'Min sak' });
    const other = await createArticle(editor(), { title: 'Deskens sak' });
    await expect(
      saveArticle(contributor(), own.id, publishable(), { expectedVersion: 1, kind: 'manual' }),
    ).resolves.toBeTruthy();
    await expect(
      saveArticle(contributor(), other.id, publishable(), { expectedVersion: 1, kind: 'manual' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getArticleForEdit(contributor(), other.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('coalesces autosaves within 60 s and keeps only the last 20', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-09-06T08:00:00Z');
    vi.setSystemTime(start);
    const ctx = editor();
    const created = await createArticle(ctx, { title: 'Autolagring' });
    let version = 1;
    const autosave = async (title: string) => {
      const r = await saveArticle(ctx, created.id, publishable({ title }), {
        expectedVersion: version,
        kind: 'autosave',
      });
      version = r.version;
    };

    // Three autosaves within a minute → one autosave revision carrying the latest state.
    await autosave('A1');
    vi.setSystemTime(new Date(start.getTime() + 20_000));
    await autosave('A2');
    vi.setSystemTime(new Date(start.getTime() + 40_000));
    await autosave('A3');
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '4:autosave']);
    const list = await listRevisions(created.id);
    expect(list[0]).toMatchObject({ version: 4, kind: 'autosave', title: 'A3' });

    // A manual save always adds its own row.
    await saveArticle(ctx, created.id, publishable({ title: 'Manuell' }), {
      expectedVersion: version,
      kind: 'manual',
    });
    version += 1;
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '4:autosave', '5:manual']);

    // Spread autosaves more than a minute apart → new rows, pruned to AUTOSAVE_KEEP.
    for (let i = 0; i < AUTOSAVE_KEEP + 5; i++) {
      vi.setSystemTime(new Date(start.getTime() + 120_000 * (i + 2)));
      await autosave(`Auto ${i}`);
    }
    const kinds = await revisionKinds(created.id);
    expect(kinds.filter((k) => k.endsWith(':autosave'))).toHaveLength(AUTOSAVE_KEEP);
    expect(kinds.filter((k) => k.endsWith(':manual'))).toEqual(['1:manual', '5:manual']);
    // The oldest autosave (v4) was pruned; the newest survives.
    expect(kinds).not.toContain('4:autosave');
    expect(kinds[kinds.length - 1]).toBe(`${version}:autosave`);
  });
});

/* -------------------------------------------------------------------------- */
/*  Transitions                                                                */
/* -------------------------------------------------------------------------- */

describe('transition', () => {
  it('lets journalists send to desk (notifying the desk) but not approve or publish', async () => {
    const ctx = journalist();
    const created = await createArticle(ctx, publishable());
    const inReview = await transition(ctx, created.id, 'in_review', { note: 'Klar for gjennomsyn' });
    expect(inReview.status).toBe('in_review');

    const desk = await db
      .select()
      .from(notifications)
      .where(eq(notifications.kind, 'article.review_requested'));
    expect(desk.map((n) => n.userId).sort()).toEqual([seed.admin.id, seed.editor.id].sort());

    await expect(transition(ctx, created.id, 'approved')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(transition(ctx, created.id, 'published')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(publishArticle(ctx, created.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(scheduleArticle(ctx, created.id, new Date(Date.now() + 3_600_000))).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    // Withdrawing to draft is fine for the writer.
    expect((await transition(ctx, created.id, 'draft')).status).toBe('draft');
  });

  it('lets editors walk the whole chain and enforces the state machine', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable());
    expect((await transition(ctx, created.id, 'in_review')).status).toBe('in_review');
    expect((await transition(ctx, created.id, 'approved')).status).toBe('approved');
    const published = await transition(ctx, created.id, 'published');
    expect(published.status).toBe('published');
    await expect(transition(ctx, created.id, 'archived')).rejects.toBeInstanceOf(ActionError);
    await expect(transition(ctx, created.id, 'draft')).rejects.toBeInstanceOf(ActionError);
    expect((await transition(ctx, created.id, 'unpublished')).status).toBe('unpublished');
    expect((await transition(ctx, created.id, 'archived')).status).toBe('archived');
    expect((await transition(ctx, created.id, 'draft')).status).toBe('draft');
  });

  it('refuses to trash published articles and supports restore', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable());
    await publishArticle(ctx, created.id);
    await expect(trashArticle(ctx, created.id)).rejects.toBeInstanceOf(ActionError);
    await unpublishArticle(ctx, created.id);
    const trashed = await trashArticle(ctx, created.id);
    expect(trashed.deletedAt).toBeInstanceOf(Date);
    await expect(
      saveArticle(ctx, created.id, publishable(), { expectedVersion: trashed.version, kind: 'manual' }),
    ).rejects.toBeInstanceOf(ActionError);
    const restored = await restoreArticle(ctx, created.id);
    expect(restored.deletedAt).toBeNull();
    // Contributors may trash their own drafts but not other people's.
    await expect(trashArticle(contributor(), created.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

/* -------------------------------------------------------------------------- */
/*  Publish                                                                    */
/* -------------------------------------------------------------------------- */

describe('publishArticle', () => {
  it('blocks on missing section, missing alt on the featured image and unticked checklist items', async () => {
    const ctx = editor();
    const noAlt = await insertMedia(null);
    const created = await createArticle(
      ctx,
      publishable({ sectionId: null, featuredMediaId: noAlt, flags: { [checklistFlag('sources')]: true } }),
    );

    const issues = await getPublishIssues(ctx, created.id);
    const errorFields = issues.filter((i) => i.level === 'error').map((i) => i.field);
    expect(errorFields).toEqual(
      expect.arrayContaining([
        'sectionId',
        'featuredMediaId',
        'checklist.rebuttal',
        'checklist.title',
        'checklist.images',
      ]),
    );
    expect(errorFields).not.toContain('checklist.sources');

    const failure = await publishArticle(ctx, created.id).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(ActionError);
    expect((failure as ActionError).code).toBe('validation');
    expect(Object.keys((failure as ActionError).fieldErrors ?? {})).toEqual(
      expect.arrayContaining(['sectionId', 'featuredMediaId']),
    );
    const [row] = await db
      .select({ status: articles.status })
      .from(articles)
      .where(eq(articles.id, created.id));
    expect(row!.status).toBe('draft');

    // Fix everything: section, alt text on the image, tick the rest of the checklist.
    await db.update(media).set({ alt: 'Svømmehallen sett fra elva' }).where(eq(media.id, noAlt));
    await saveArticle(ctx, created.id, publishable({ featuredMediaId: noAlt }), {
      expectedVersion: 1,
      kind: 'manual',
    });
    expect((await getPublishIssues(ctx, created.id)).filter((i) => i.level === 'error')).toEqual([]);
    expect((await publishArticle(ctx, created.id)).status).toBe('published');
  });

  it('sets publishedAt/firstPublishedAt, records a publish revision, audits and notifies', async () => {
    const ctx = editor();
    const created = await createArticle(journalist(), publishable());
    const before = Date.now();
    const published = await publishArticle(ctx, created.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(published.firstPublishedAt!.getTime()).toBe(published.publishedAt!.getTime());
    expect(published.version).toBe(2);
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '2:publish']);

    const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'article.publish'));
    expect(audits).toHaveLength(1);
    const notes = await db.select().from(notifications).where(eq(notifications.kind, 'article.published'));
    expect(notes.map((n) => n.userId)).toEqual([seed.journalist.id]);

    // Unpublish and republish keeps the original publish date.
    await unpublishArticle(ctx, created.id);
    const again = await publishArticle(ctx, created.id);
    expect(again.publishedAt!.getTime()).toBe(published.publishedAt!.getTime());
    expect(again.unpublishedAt).toBeNull();
  });

  it('adds a redirect when the canonical path of a published article changes', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable({ title: 'Gammel adresse' }));
    const published = await publishArticle(ctx, created.id);
    expect(published.slug).toBe('gammel-adresse');

    // Editing the slug of a published article redirects immediately.
    const saved = await saveArticle(
      ctx,
      created.id,
      publishable({ title: 'Gammel adresse', slug: 'ny-adresse' }),
      {
        expectedVersion: published.version,
        kind: 'manual',
      },
    );
    expect(saved.article.slug).toBe('ny-adresse');
    let rows = await db.select().from(redirects).where(eq(redirects.siteId, seed.site.id));
    expect(rows).toEqual([
      expect.objectContaining({
        fromPath: '/nyheter/gammel-adresse',
        toPath: '/nyheter/ny-adresse',
        statusCode: 301,
      }),
    ]);

    // Moving to another section while unpublished → redirect written on republish, chains collapsed.
    await unpublishArticle(ctx, created.id);
    const moved = await saveArticle(
      ctx,
      created.id,
      publishable({ title: 'Gammel adresse', slug: 'ny-adresse', sectionId: seed.sections.sport.id }),
      { expectedVersion: saved.version, kind: 'manual' }, // unpublishing changes status only, never the version
    );
    await publishArticle(ctx, created.id);
    expect(moved.article.sectionId).toBe(seed.sections.sport.id);
    rows = await db.select().from(redirects).where(eq(redirects.siteId, seed.site.id));
    expect(rows.map((r) => `${r.fromPath} → ${r.toPath}`).sort()).toEqual([
      '/nyheter/gammel-adresse → /sport/ny-adresse',
      '/nyheter/ny-adresse → /sport/ny-adresse',
    ]);
  });

  it('keeps the slug of a published article stable when only the title changes', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable({ title: 'Første tittel' }));
    await publishArticle(ctx, created.id);
    const saved = await saveArticle(ctx, created.id, publishable({ title: 'Helt ny tittel' }), {
      expectedVersion: 2,
      kind: 'manual',
    });
    expect(saved.article.slug).toBe('forste-tittel');
    expect(await db.select().from(redirects)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Schedule                                                                   */
/* -------------------------------------------------------------------------- */

describe('scheduleArticle', () => {
  it('schedules a future time and rejects the past', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable());
    await expect(scheduleArticle(ctx, created.id, new Date(Date.now() - 60_000))).rejects.toMatchObject({
      code: 'validation',
    });
    const at = new Date(Date.now() + 3_600_000);
    const scheduled = await scheduleArticle(ctx, created.id, at);
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.scheduledAt?.getTime()).toBe(at.getTime());
    // Via transition() as the UI does it, and cancelling clears the time.
    const later = new Date(at.getTime() + 3_600_000);
    expect(
      (await transition(ctx, created.id, 'scheduled', { scheduledAt: later })).scheduledAt?.getTime(),
    ).toBe(later.getTime());
    await expect(transition(ctx, created.id, 'scheduled')).rejects.toMatchObject({ code: 'validation' });
    const cancelled = await transition(ctx, created.id, 'draft');
    expect(cancelled).toMatchObject({ status: 'draft', scheduledAt: null });
  });

  it('applies publish validation when scheduling', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable({ sectionId: null }));
    await expect(scheduleArticle(ctx, created.id, new Date(Date.now() + 3_600_000))).rejects.toMatchObject({
      code: 'validation',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Revisions, duplicates, content type                                        */
/* -------------------------------------------------------------------------- */

describe('restoreRevision / diffRevisions', () => {
  it('restores an earlier snapshot as a new "restore" revision', async () => {
    const ctx = editor();
    const created = await createArticle(
      ctx,
      publishable({ title: 'Versjon én', body: body('Første tekst.') }),
    );
    await saveArticle(
      ctx,
      created.id,
      publishable({ title: 'Versjon to', body: body('Andre tekst.'), tagIds: [] }),
      {
        expectedVersion: 1,
        kind: 'manual',
      },
    );
    const revisions = await listRevisions(created.id);
    const first = revisions.find((r) => r.version === 1)!;

    const diff = await diffRevisions(ctx, created.id, revisions[0]!.id, first.id);
    expect(diff.from.version).toBe(1);
    expect(diff.to.version).toBe(2);
    expect(diff.diff.bodyChanged).toBe(true);
    expect(diff.diff.text.some((c) => c.removed && c.value.includes('Første'))).toBe(true);
    expect(diff.diff.text.some((c) => c.added && c.value.includes('Andre'))).toBe(true);
    expect(diff.diff.fields.map((f) => f.field)).toEqual(expect.arrayContaining(['title', 'slug', 'tagIds']));
    expect(diff.diff.fields.find((f) => f.field === 'tagIds')).toMatchObject({
      before: seed.tags[0]!.name,
      after: '',
    });

    const restored = await restoreRevision(ctx, created.id, first.id);
    expect(restored).toMatchObject({ title: 'Versjon én', version: 3, bodyText: 'Første tekst.' });
    expect(await revisionKinds(created.id)).toEqual(['1:manual', '2:manual', '3:restore']);
    const tags = await db.select().from(articleTags).where(eq(articleTags.articleId, created.id));
    expect(tags.map((t) => t.tagId)).toEqual([seed.tags[0]!.id]);
  });
});

describe('duplicateArticle / changeContentType', () => {
  it('copies content, tags and bylines into a fresh draft with a unique slug', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, publishable({ title: 'Original', isBreaking: true }));
    await publishArticle(ctx, created.id);
    const copy = await duplicateArticle(ctx, created.id);
    expect(copy).toMatchObject({
      status: 'draft',
      title: 'Kopi av Original',
      version: 1,
      isBreaking: false,
      publishedAt: null,
    });
    expect(copy.slug).toBe('original-kopi');
    expect(copy.id).not.toBe(created.id);
    expect(Object.keys(copy.flags).some((k) => k.startsWith('checklist:'))).toBe(false);
    const bylines = await db.select().from(articleBylines).where(eq(articleBylines.articleId, copy.id));
    expect(bylines.map((b) => b.authorId)).toEqual([seed.authors.journalist.id]);
    const tags = await db.select().from(articleTags).where(eq(articleTags.articleId, copy.id));
    expect(tags).toHaveLength(1);
    const second = await duplicateArticle(ctx, created.id);
    expect(second.slug).toBe('original-kopi-2');
  });

  it('changes content type keeping only fields both types know', async () => {
    const ctx = editor();
    const created = await createArticle(ctx, {
      title: 'Leder',
      contentTypeId: seed.contentTypes.opinion.id,
      customFields: { standpoint: 'leder' },
    });
    expect(created.customFields).toEqual({ standpoint: 'leder' });
    const changed = await changeContentType(ctx, created.id, seed.contentTypes.notice.id);
    expect(changed.contentTypeId).toBe(seed.contentTypes.notice.id);
    expect(changed.customFields).toEqual({});
    expect(changed.version).toBe(2);
    const model = await getArticleForEdit(ctx, created.id);
    expect(model.contentType.key).toBe('notice');
  });
});

/* -------------------------------------------------------------------------- */
/*  Edit model, checklist, notes, assignment                                   */
/* -------------------------------------------------------------------------- */

describe('getArticleForEdit and small mutations', () => {
  it('builds the edit model with options, checklist state, issues and permissions', async () => {
    const ctx = journalist();
    const withAlt = await insertMedia('Alt-tekst');
    const created = await createArticle(ctx, publishable({ featuredMediaId: withAlt, flags: {} }));
    await toggleChecklistItem(ctx, created.id, 'sources', true);
    const model = await getArticleForEdit(ctx, created.id);
    expect(model.contentType.key).toBe('article');
    expect(model.contentTypes.map((c) => c.key).sort()).toEqual(['article', 'notice', 'opinion']);
    expect(model.sections.map((s) => s.slug)).toEqual(['nyheter', 'sport']);
    expect(model.tagOptions).toHaveLength(2);
    expect(model.authorOptions).toHaveLength(4);
    expect(model.featuredMedia?.id).toBe(withAlt);
    expect(model.bylines).toEqual([{ authorId: seed.authors.journalist.id, role: 'text' }]);
    expect(model.checklist.items.find((i) => i.id === 'sources')?.checked).toBe(true);
    expect(model.checklist.items.find((i) => i.id === 'title')?.checked).toBe(false);
    expect(model.publishIssues.filter((i) => i.level === 'error').map((i) => i.field)).toEqual([
      'checklist.rebuttal',
      'checklist.title',
      'checklist.images',
    ]);
    expect(model.permissions).toMatchObject({ edit: true, publish: false, review: true, delete: false });
    expect(model.publicPath).toBe('/nyheter/kommunestyret-vedtok-budsjettet');
    expect(model.revisions.count).toBe(1);
    expect(model.members.map((m) => m.id).sort()).toEqual(
      [seed.admin.id, seed.editor.id, seed.journalist.id, seed.contributor.id].sort(),
    );
    expect(model.lock).toMatchObject({ lockedBy: null, mine: false });
    await expect(toggleChecklistItem(ctx, created.id, 'nope', true)).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('adds notes that notify creator and assignee, and assigns with notification', async () => {
    const created = await createArticle(journalist(), publishable());
    const assigned = await assignArticle(editor(), created.id, {
      assignedTo: seed.contributor.id,
      deadlineAt: null,
      plannedAt: null,
    });
    expect(assigned.assignedTo).toBe(seed.contributor.id);
    const assignedNotes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.kind, 'article.assigned'));
    expect(assignedNotes.map((n) => n.userId)).toEqual([seed.contributor.id]);

    const note = await addNote(editor(), created.id, 'Sjekk tallene i avsnitt to.');
    expect(note.body).toBe('Sjekk tallene i avsnitt to.');
    const noteNotes = await db.select().from(notifications).where(eq(notifications.kind, 'article.note'));
    expect(noteNotes.map((n) => n.userId).sort()).toEqual([seed.contributor.id, seed.journalist.id].sort());
    await expect(addNote(editor(), created.id, '   ')).rejects.toMatchObject({ code: 'validation' });
    await expect(
      assignArticle(editor(), created.id, {
        assignedTo: crypto.randomUUID(),
        deadlineAt: null,
        plannedAt: null,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    const row = await db
      .select({ v: articles.version })
      .from(articles)
      .where(and(eq(articles.id, created.id), eq(articles.siteId, seed.site.id)));
    expect(row[0]!.v).toBe(1); // notes/assignment never bump the content version
  });
});
