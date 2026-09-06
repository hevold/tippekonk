/**
 * Shared fixtures for the public area tests: a seeded newsroom plus a set
 * of articles covering every visibility rule (published, plus, sponsored,
 * breaking, draft, scheduled-in-the-future, trashed) and a media row.
 * Not a test file itself (no `.test.` in the name).
 */
import {
  articleBylines,
  articleRelated,
  articleTags,
  articleViews,
  articles,
  media,
  type ArticleAccess,
  type ArticleStatus,
  type Media,
} from '@/db/schema';
import type { Db } from '@/db';
import type { ContentDoc } from '@/lib/content/types';
import { docToPlainText, docWordCount, readingTimeMinutes } from '@/lib/content/text';
import type { SeedMinimalResult } from '@/test/db';

export function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

export function doc(...paragraphs: string[]): ContentDoc {
  return { type: 'doc', content: paragraphs.map(paragraph) };
}

export type FixtureArticle = {
  key: string;
  title: string;
  slug: string;
  kicker?: string;
  lead?: string;
  sectionId: string | null;
  contentTypeId: string;
  status: ArticleStatus;
  access?: ArticleAccess;
  isBreaking?: boolean;
  isSponsored?: boolean;
  publishedAt?: Date | null;
  deletedAt?: Date | null;
  body?: ContentDoc;
  featuredMediaId?: string | null;
  authorIds?: string[];
  tagIds?: string[];
  createdBy?: string;
};

export async function insertMedia(db: Db, siteId: string, overrides: Partial<Media> = {}): Promise<Media> {
  const [row] = await db
    .insert(media)
    .values({
      siteId,
      kind: 'image',
      filename: 'bilde.jpg',
      storageKey: '2026/09/bilde.jpg',
      mime: 'image/jpeg',
      size: 12_345,
      width: 1600,
      height: 900,
      alt: 'Rådhuset i Elvebyen',
      credit: 'Foto: Test Fotograf',
      variants: {
        '640': { key: '2026/09/bilde-640.webp', width: 640, height: 360, format: 'webp', size: 20_000 },
        '1280': { key: '2026/09/bilde-1280.webp', width: 1280, height: 720, format: 'webp', size: 60_000 },
      },
      dominantColor: '#334455',
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insertMedia failed');
  return row;
}

export async function insertArticle(db: Db, siteId: string, spec: FixtureArticle): Promise<string> {
  const body = spec.body ?? doc(`${spec.title}. Første avsnitt.`, 'Andre avsnitt.', 'Tredje avsnitt.');
  const bodyText = docToPlainText(body);
  const words = docWordCount(body);
  const publishedAt =
    spec.publishedAt === undefined
      ? spec.status === 'published'
        ? new Date(Date.now() - 3_600_000)
        : null
      : spec.publishedAt;
  const [row] = await db
    .insert(articles)
    .values({
      siteId,
      contentTypeId: spec.contentTypeId,
      sectionId: spec.sectionId,
      kicker: spec.kicker ?? null,
      title: spec.title,
      lead: spec.lead ?? `Ingress for ${spec.title}`,
      slug: spec.slug,
      body,
      bodyText,
      status: spec.status,
      access: spec.access ?? 'open',
      isBreaking: spec.isBreaking ?? false,
      isSponsored: spec.isSponsored ?? false,
      publishedAt,
      firstPublishedAt: publishedAt,
      featuredMediaId: spec.featuredMediaId ?? null,
      wordCount: words,
      readingTimeMin: readingTimeMinutes(words),
      deletedAt: spec.deletedAt ?? null,
      createdBy: spec.createdBy ?? null,
      updatedAt: publishedAt ?? new Date(),
    })
    .returning({ id: articles.id });
  if (!row) throw new Error('insertArticle failed');
  if (spec.authorIds?.length) {
    await db
      .insert(articleBylines)
      .values(spec.authorIds.map((authorId, i) => ({ articleId: row.id, authorId, sortOrder: i })));
  }
  if (spec.tagIds?.length) {
    await db.insert(articleTags).values(spec.tagIds.map((tagId) => ({ articleId: row.id, tagId })));
  }
  return row.id;
}

export async function relate(db: Db, articleId: string, relatedIds: string[]): Promise<void> {
  await db
    .insert(articleRelated)
    .values(relatedIds.map((relatedId, i) => ({ articleId, relatedId, sortOrder: i })));
}

export async function addViews(db: Db, articleId: string, day: string, views: number): Promise<void> {
  await db.insert(articleViews).values({ articleId, day, views });
}

export type Newsroom = {
  ids: Record<string, string>;
  media: Media;
};

/**
 * The standard article set:
 *  - skole (published, nyheter, tags[0], image, breaking now)
 *  - budsjett (published 2 days ago, nyheter, plus)
 *  - fotball (published 1 day ago, sport)
 *  - sponset (published, sport, sponsored)
 *  - kommentar (published, opinion type, nyheter)
 *  - utkast (draft), planlagt (published status but future publishedAt), slettet (trashed), avpublisert
 */
export async function seedNewsroom(db: Db, seeded: SeedMinimalResult): Promise<Newsroom> {
  const site = seeded.site.id;
  const image = await insertMedia(db, site);
  const ct = seeded.contentTypes;
  const ids: Record<string, string> = {};
  const hour = 3_600_000;
  const now = Date.now();

  ids.skole = await insertArticle(db, site, {
    key: 'skole',
    title: 'Ny skole på Storåsen åpner til høsten',
    slug: 'ny-skole-pa-storasen',
    kicker: 'Skole',
    lead: 'Elevene flytter inn i august.',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.article.id,
    status: 'published',
    isBreaking: true,
    publishedAt: new Date(now - hour),
    featuredMediaId: image.id,
    authorIds: [seeded.authors.journalist.id],
    tagIds: [seeded.tags[0]!.id],
    body: doc(
      'Skolen får plass til 400 elever.',
      'Byggingen startet i fjor.',
      'Rektor gleder seg til skolestart.',
    ),
    createdBy: seeded.journalist.id,
  });
  ids.budsjett = await insertArticle(db, site, {
    key: 'budsjett',
    title: 'Budsjettet vedtatt i kommunestyret',
    slug: 'budsjettet-vedtatt',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.article.id,
    status: 'published',
    access: 'plus',
    publishedAt: new Date(now - 48 * hour),
    authorIds: [seeded.authors.editor.id, seeded.authors.journalist.id],
    tagIds: [seeded.tags[0]!.id],
    body: doc(
      'Kommunestyret vedtok budsjettet torsdag.',
      'Eiendomsskatten øker.',
      'Opposisjonen protesterte.',
      'Møtet varte i seks timer.',
    ),
    createdBy: seeded.editor.id,
  });
  ids.fotball = await insertArticle(db, site, {
    key: 'fotball',
    title: 'Elvebyen vant cupkampen',
    slug: 'elvebyen-vant-cupkampen',
    sectionId: seeded.sections.sport.id,
    contentTypeId: ct.article.id,
    status: 'published',
    publishedAt: new Date(now - 24 * hour),
    featuredMediaId: image.id,
    authorIds: [seeded.authors.contributor.id],
    tagIds: [seeded.tags[1]!.id],
    createdBy: seeded.contributor.id,
  });
  ids.sponset = await insertArticle(db, site, {
    key: 'sponset',
    title: 'Slik sparer du til bolig',
    slug: 'slik-sparer-du-til-bolig',
    sectionId: seeded.sections.sport.id,
    contentTypeId: ct.article.id,
    status: 'published',
    isSponsored: true,
    publishedAt: new Date(now - 5 * hour),
  });
  ids.kommentar = await insertArticle(db, site, {
    key: 'kommentar',
    title: 'Kommentar: Skolene trenger mer enn nye bygg',
    slug: 'kommentar-skolene',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.opinion.id,
    status: 'published',
    publishedAt: new Date(now - 10 * hour),
    authorIds: [seeded.authors.admin.id],
  });
  ids.utkast = await insertArticle(db, site, {
    key: 'utkast',
    title: 'Utkast om skole',
    slug: 'utkast-om-skole',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.article.id,
    status: 'draft',
    createdBy: seeded.contributor.id,
  });
  ids.planlagt = await insertArticle(db, site, {
    key: 'planlagt',
    title: 'Fremtidig sak om skole',
    slug: 'fremtidig-sak',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.article.id,
    status: 'published',
    publishedAt: new Date(now + 24 * hour),
  });
  ids.slettet = await insertArticle(db, site, {
    key: 'slettet',
    title: 'Slettet sak om skole',
    slug: 'slettet-sak',
    sectionId: seeded.sections.nyheter.id,
    contentTypeId: ct.article.id,
    status: 'published',
    publishedAt: new Date(now - hour),
    deletedAt: new Date(),
  });
  ids.avpublisert = await insertArticle(db, site, {
    key: 'avpublisert',
    title: 'Avpublisert sak',
    slug: 'avpublisert-sak',
    sectionId: seeded.sections.sport.id,
    contentTypeId: ct.article.id,
    status: 'unpublished',
    publishedAt: new Date(now - hour),
  });

  await relate(db, ids.skole, [ids.budsjett, ids.utkast, ids.fotball]);
  return { ids, media: image };
}
