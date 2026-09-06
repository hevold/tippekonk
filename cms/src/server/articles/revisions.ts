/**
 * Article revisions (SPEC 5.5): snapshots, the autosave coalescing/pruning
 * policy, listing for the "Versjoner" page and word-level diffs between two
 * revisions (via the `diff` package).
 *
 *   await recordRevision(tx, { article, tagIds, bylines, kind: 'manual', userId })
 *   await listRevisions(articleId)                → newest first, with author names
 *   diffSnapshots(older, newer)                    → { text: Change[]; fields: FieldDiff[] }
 *
 * Policy: manual, publish and restore saves always add a row. Autosaves
 * reuse the previous autosave row when it is younger than
 * AUTOSAVE_COALESCE_MS, and only the newest AUTOSAVE_KEEP autosaves per
 * article survive.
 */
import 'server-only';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { diffWordsWithSpace } from 'diff';

import { db, type Db, type Tx } from '@/db';
import {
  articleRevisions,
  users,
  type Article,
  type ArticleRevision,
  type ArticleSnapshot,
  type BylineRole,
  type RevisionKind,
} from '@/db/schema';
import { docToPlainText } from '@/lib/content/text';

export const AUTOSAVE_COALESCE_MS = 60_000;
export const AUTOSAVE_KEEP = 20;

type Writer = Db | Tx;

export type SnapshotSource = Pick<
  Article,
  | 'kicker'
  | 'title'
  | 'lead'
  | 'slug'
  | 'body'
  | 'customFields'
  | 'sectionId'
  | 'access'
  | 'featuredMediaId'
  | 'featuredCaption'
  | 'featuredCredit'
  | 'seoTitle'
  | 'seoDescription'
  | 'isBreaking'
  | 'isSponsored'
>;

export function buildSnapshot(
  article: SnapshotSource,
  tagIds: string[],
  bylines: { authorId: string; role: BylineRole }[],
): ArticleSnapshot {
  return {
    kicker: article.kicker,
    title: article.title,
    lead: article.lead,
    slug: article.slug,
    body: article.body,
    customFields: article.customFields ?? {},
    sectionId: article.sectionId,
    access: article.access,
    featuredMediaId: article.featuredMediaId,
    featuredCaption: article.featuredCaption,
    featuredCredit: article.featuredCredit,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    tagIds: [...tagIds],
    bylines: bylines.map((b) => ({ authorId: b.authorId, role: b.role })),
    isBreaking: article.isBreaking,
    isSponsored: article.isSponsored,
  };
}

export type RecordRevisionInput = {
  articleId: string;
  version: number;
  snapshot: ArticleSnapshot;
  kind: RevisionKind;
  userId: string | null;
  note?: string | null;
  now?: Date;
};

/**
 * Store a revision for the given version. Autosaves are coalesced into the
 * previous autosave row when that row is younger than the coalescing window
 * (its snapshot and version move forward, its timestamp stays), then pruned
 * so only the newest AUTOSAVE_KEEP autosaves remain.
 */
export async function recordRevision(tx: Writer, input: RecordRevisionInput): Promise<ArticleRevision> {
  const now = input.now ?? new Date();
  if (input.kind === 'autosave') {
    const [latest] = await tx
      .select()
      .from(articleRevisions)
      .where(eq(articleRevisions.articleId, input.articleId))
      .orderBy(desc(articleRevisions.version))
      .limit(1);
    if (
      latest &&
      latest.kind === 'autosave' &&
      now.getTime() - latest.createdAt.getTime() < AUTOSAVE_COALESCE_MS
    ) {
      const [updated] = await tx
        .update(articleRevisions)
        .set({ snapshot: input.snapshot, version: input.version, createdBy: input.userId })
        .where(eq(articleRevisions.id, latest.id))
        .returning();
      if (updated) return updated;
    }
  }
  const [row] = await tx
    .insert(articleRevisions)
    .values({
      articleId: input.articleId,
      version: input.version,
      kind: input.kind,
      snapshot: input.snapshot,
      note: input.note ?? null,
      createdBy: input.userId,
      createdAt: now,
    })
    .returning();
  if (!row) throw new Error('Kunne ikke lagre versjonen.');
  if (input.kind === 'autosave') await pruneAutosaves(tx, input.articleId);
  return row;
}

/** Delete autosave revisions beyond the newest AUTOSAVE_KEEP. */
export async function pruneAutosaves(tx: Writer, articleId: string): Promise<number> {
  const stale = await tx
    .select({ id: articleRevisions.id })
    .from(articleRevisions)
    .where(and(eq(articleRevisions.articleId, articleId), eq(articleRevisions.kind, 'autosave')))
    .orderBy(desc(articleRevisions.version))
    .offset(AUTOSAVE_KEEP);
  if (stale.length === 0) return 0;
  await tx.delete(articleRevisions).where(
    inArray(
      articleRevisions.id,
      stale.map((r) => r.id),
    ),
  );
  return stale.length;
}

export type RevisionSummary = {
  id: string;
  version: number;
  kind: RevisionKind;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
  title: string;
  wordCount: number;
};

/** Revisions newest first, with the saving user's name and a title/word count for the list. */
export async function listRevisions(articleId: string, limit = 200): Promise<RevisionSummary[]> {
  const rows = await db
    .select({
      id: articleRevisions.id,
      version: articleRevisions.version,
      kind: articleRevisions.kind,
      note: articleRevisions.note,
      createdAt: articleRevisions.createdAt,
      snapshot: articleRevisions.snapshot,
      userId: users.id,
      userName: users.name,
    })
    .from(articleRevisions)
    .leftJoin(users, eq(users.id, articleRevisions.createdBy))
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.version))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    kind: r.kind,
    note: r.note,
    createdAt: r.createdAt,
    createdBy: r.userId && r.userName ? { id: r.userId, name: r.userName } : null,
    title: r.snapshot.title,
    wordCount: countWords(docToPlainText(r.snapshot.body)),
  }));
}

function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

export async function getRevision(articleId: string, revisionId: string): Promise<ArticleRevision | null> {
  const [row] = await db
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)))
    .limit(1);
  return row ?? null;
}

export async function countRevisions(articleId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId));
  return row?.value ?? 0;
}

/** The most recent revision of a kind (e.g. the last 'publish' snapshot, used for redirects). */
export async function latestRevisionOfKind(
  tx: Writer,
  articleId: string,
  kind: RevisionKind,
): Promise<ArticleRevision | null> {
  const [row] = await tx
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.articleId, articleId), eq(articleRevisions.kind, kind)))
    .orderBy(desc(articleRevisions.version))
    .limit(1);
  return row ?? null;
}

/** Oldest-first list of versions (used by tests and the diff page's ordering). */
export async function revisionVersions(articleId: string): Promise<number[]> {
  const rows = await db
    .select({ version: articleRevisions.version })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(asc(articleRevisions.version));
  return rows.map((r) => r.version);
}

/* -------------------------------------------------------------------------- */
/*  Diffing                                                                    */
/* -------------------------------------------------------------------------- */

export type DiffChange = { value: string; added?: boolean; removed?: boolean };

export type FieldDiff = {
  field: string;
  before: string;
  after: string;
  /** Word diff of the two values (for short text fields). */
  changes: DiffChange[];
};

export type SnapshotDiff = {
  /** Word-level diff of the plain-text body. */
  text: DiffChange[];
  /** Field-level changes (only fields that differ). */
  fields: FieldDiff[];
  bodyChanged: boolean;
};

function scalarToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nei';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : scalarToText(v))).join(', ');
  }
  return JSON.stringify(value, null, 0);
}

function wordDiff(before: string, after: string): DiffChange[] {
  return diffWordsWithSpace(before, after).map((c) => ({
    value: c.value,
    added: c.added || undefined,
    removed: c.removed || undefined,
  }));
}

/**
 * Compare two snapshots. `resolve` may translate ids to names (sections,
 * tags, authors, media) so the field diff reads well; it receives the field
 * name and the raw value.
 */
export function diffSnapshots(
  older: ArticleSnapshot,
  newer: ArticleSnapshot,
  resolve: (field: string, value: unknown) => string = (_f, v) => scalarToText(v),
): SnapshotDiff {
  const beforeText = docToPlainText(older.body);
  const afterText = docToPlainText(newer.body);
  const fields: FieldDiff[] = [];
  const keys: (keyof ArticleSnapshot)[] = [
    'kicker',
    'title',
    'lead',
    'slug',
    'sectionId',
    'access',
    'featuredMediaId',
    'featuredCaption',
    'featuredCredit',
    'seoTitle',
    'seoDescription',
    'isBreaking',
    'isSponsored',
    'tagIds',
    'bylines',
    'customFields',
  ];
  for (const key of keys) {
    const a = older[key];
    const b = newer[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    const before = resolve(key, a);
    const after = resolve(key, b);
    fields.push({ field: key, before, after, changes: wordDiff(before, after) });
  }
  return {
    text: beforeText === afterText ? [{ value: afterText }] : wordDiff(beforeText, afterText),
    fields,
    bodyChanged: beforeText !== afterText,
  };
}
