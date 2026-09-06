/**
 * Article service (SPEC 4.7) — the editorial core: create, save with
 * optimistic versioning and revisions, workflow transitions, publishing
 * with validation and redirects, scheduling, trash, duplicates, restore
 * from revision, notes, assignment and checklist ticks.
 *
 * Every function takes the caller's AdminContext and does its own
 * permission checks, then: validate → transaction → audit → notifications
 * → cache revalidation → webhooks. Server actions (actions.ts) and route
 * handlers are thin wrappers around these.
 */
import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db, type Tx } from '@/db';
import {
  articleNotes,
  articles,
  type Article,
  type ArticleNote,
  type ArticleStatus,
  type RevisionKind,
} from '@/db/schema';
import { adminPaths } from '@/config/routes';
import { docMediaIds } from '@/lib/content/text';
import { EMPTY_DOC } from '@/lib/content/types';
import { formatDate } from '@/lib/dates';
import { articleInputSchema, type ArticleInput, type ArticleInputRaw } from '@/lib/validation/article';
import { ActionError, ConflictError, ForbiddenError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';
import type { AdminContext } from '@/server/auth/context';
import { assertCan } from '@/server/auth/guards';
import { revalidateArticle } from '@/server/cache';
import { getMediaMany } from '@/server/media/queries';
import { notify } from '@/server/notifications';
import { enqueueWebhookEvent, type WebhookEvent } from '@/server/webhooks';

import { releaseLock } from './locks';
import {
  canEditArticle,
  canonicalPath,
  defaultContentType,
  deskUserIds,
  existingArticleIds,
  existingAuthorIds,
  existingTagIds,
  loadArticle,
  loadContentType,
  loadRelations,
  pickKnownCustomFields,
  placeholderSlug,
  recordRedirect,
  resolveSlug,
  sectionBelongsToSite,
  SLUG_LOCKED_FLAG,
  slugExists,
  syncBylines,
  syncRelated,
  syncTags,
  textFields,
  type BylineRow,
} from './mutations';
import { getEditableArticle } from './queries';
import {
  buildSnapshot,
  diffSnapshots,
  getRevision,
  latestRevisionOfKind,
  recordRevision,
  type SnapshotDiff,
} from './revisions';
import {
  canTransition,
  canTrash,
  checklistFlag,
  hasBlockingIssues,
  issuesToFieldErrors,
  validateForPublish,
  type PublishIssue,
} from './validation';

export type SaveKind = Extract<RevisionKind, 'autosave' | 'manual'>;

export type SaveResult = { article: Article; version: number };

const NOTIFY_KIND = {
  reviewRequested: 'article.review_requested',
  approved: 'article.approved',
  returned: 'article.returned',
  published: 'article.published',
  scheduled: 'article.scheduled',
  unpublished: 'article.unpublished',
  note: 'article.note',
  assigned: 'article.assigned',
} as const;

function titleOf(article: Pick<Article, 'title'>): string {
  return article.title.trim() || '(Uten tittel)';
}

function assertEditable(ctx: AdminContext, article: Article): void {
  if (!canEditArticle(ctx, article)) throw new ForbiddenError('Du kan ikke redigere denne saken.');
  if (article.deletedAt)
    throw new ActionError('Saken ligger i papirkurven. Gjenopprett den først.', 'conflict');
}

function withoutChecklist(flags: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(flags))
    if (!k.startsWith('checklist:') && k !== SLUG_LOCKED_FLAG) out[k] = v;
  return out;
}

async function recipientsFor(article: Article, except: string): Promise<string[]> {
  return [article.createdBy, article.assignedTo].filter((id): id is string => Boolean(id) && id !== except);
}

async function webhookPayload(tx: Tx | typeof db, article: Article): Promise<Record<string, unknown>> {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    path: await canonicalPath(tx, article),
    sectionId: article.sectionId,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    updatedAt: article.updatedAt.toISOString(),
  };
}

async function emitWebhook(ctx: AdminContext, event: WebhookEvent, article: Article): Promise<void> {
  try {
    await enqueueWebhookEvent(ctx.site.id, event, await webhookPayload(db, article));
  } catch (err) {
    console.error('[articles] webhook', err);
  }
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createArticle(
  ctx: AdminContext,
  input: Partial<ArticleInputRaw> = {},
): Promise<Article> {
  assertCan(ctx, 'article:create');
  const data = articleInputSchema.parse(input);

  const created = await db.transaction(async (tx) => {
    const contentType = data.contentTypeId
      ? await loadContentType(tx, ctx.site.id, data.contentTypeId)
      : await defaultContentType(tx, ctx.site.id);
    if (!contentType)
      throw new ActionError(
        'Nettstedet har ingen innholdstype. Opprett en under Innholdstyper.',
        'validation',
      );
    if (!contentType.isActive && data.contentTypeId) {
      throw new ActionError('Innholdstypen er deaktivert.', 'validation');
    }
    if (data.sectionId && !(await sectionBelongsToSite(tx, ctx.site.id, data.sectionId))) {
      throw new ActionError('Ugyldig seksjon.', 'validation', { sectionId: ['Ugyldig seksjon'] });
    }

    const slug = data.slug
      ? await resolveSlug(tx, {
          siteId: ctx.site.id,
          articleId: '',
          current: '',
          requested: data.slug,
          title: data.title,
          locked: false,
        })
      : data.title.trim()
        ? await resolveSlug(tx, {
            siteId: ctx.site.id,
            articleId: '',
            current: '',
            requested: '',
            title: data.title,
            locked: false,
          })
        : await placeholderSlug(tx, ctx.site.id);
    const body = data.body ?? EMPTY_DOC;
    const text = textFields(body);
    const flags: Record<string, boolean> = { ...data.flags };
    if (data.slug) flags[SLUG_LOCKED_FLAG] = true;

    const [article] = await tx
      .insert(articles)
      .values({
        siteId: ctx.site.id,
        contentTypeId: contentType.id,
        sectionId: data.sectionId,
        kicker: data.kicker,
        title: data.title,
        lead: data.lead,
        slug,
        body,
        ...text,
        customFields: pickKnownCustomFields(contentType.fields, data.customFields),
        access: data.access,
        featuredMediaId: data.featuredMediaId,
        featuredCaption: data.featuredCaption,
        featuredCredit: data.featuredCredit,
        seoTitle: data.seoTitle,
        seoDescription: data.seoDescription,
        canonicalUrl: data.canonicalUrl,
        noIndex: data.noIndex,
        isBreaking: data.isBreaking,
        isSponsored: data.isSponsored,
        flags,
        assignedTo: data.assignedTo ?? ctx.user.id,
        deadlineAt: data.deadlineAt,
        plannedAt: data.plannedAt,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
        version: 1,
      })
      .returning();
    if (!article) throw new Error('Kunne ikke opprette saken.');

    const tagIds = await existingTagIds(tx, ctx.site.id, data.tagIds);
    const authorIds = new Set(
      await existingAuthorIds(
        tx,
        ctx.site.id,
        data.bylines.map((b) => b.authorId),
      ),
    );
    const bylines: BylineRow[] = data.bylines.filter((b) => authorIds.has(b.authorId));
    const relatedIds = await existingArticleIds(tx, ctx.site.id, data.relatedIds, article.id);
    await syncTags(tx, article.id, tagIds);
    await syncBylines(tx, article.id, bylines);
    await syncRelated(tx, article.id, relatedIds);
    await recordRevision(tx, {
      articleId: article.id,
      version: 1,
      snapshot: buildSnapshot(article, tagIds, bylines),
      kind: 'manual',
      userId: ctx.user.id,
      note: 'Opprettet',
    });
    return { article, contentTypeKey: contentType.key };
  });

  // Audit outside the transaction: the embedded PGlite driver serialises queries on
  // one connection, so a `db` query inside an open transaction would deadlock.
  await auditFromContext(ctx, {
    action: 'article.create',
    entityType: 'article',
    entityId: created.article.id,
    summary: `Opprettet «${titleOf(created.article)}»`,
    data: { contentType: created.contentTypeKey },
  });
  return created.article;
}

/* -------------------------------------------------------------------------- */
/*  Save                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Save the full editable payload. `expectedVersion` must match the stored
 * version, otherwise ConflictError (someone else saved first). Manual saves
 * always create a revision; autosaves are coalesced and pruned (SPEC 5.5).
 */
export async function saveArticle(
  ctx: AdminContext,
  id: string,
  input: ArticleInputRaw | ArticleInput,
  opts: { expectedVersion: number; kind: SaveKind },
): Promise<SaveResult> {
  const data = articleInputSchema.parse(input);
  const existing = await loadArticle(ctx.site.id, id);
  if (!existing) throw new NotFoundError('Fant ikke saken.');
  assertEditable(ctx, existing);
  if (existing.version !== opts.expectedVersion) throw await conflictFor(existing);

  // Once an article has been public its address may be bookmarked, so every later
  // path change (also while unpublished) leaves a redirect behind (SPEC 5.3).
  const everPublished = Boolean(existing.firstPublishedAt);
  const oldPath = everPublished ? await canonicalPath(db, existing) : null;

  const result = await db
    .transaction(async (tx) => {
      const contentType =
        (data.contentTypeId && data.contentTypeId !== existing.contentTypeId
          ? await loadContentType(tx, ctx.site.id, data.contentTypeId)
          : await loadContentType(tx, ctx.site.id, existing.contentTypeId)) ??
        (await defaultContentType(tx, ctx.site.id));
      if (!contentType) throw new ActionError('Innholdstypen finnes ikke.', 'validation');
      if (data.sectionId && !(await sectionBelongsToSite(tx, ctx.site.id, data.sectionId))) {
        throw new ActionError('Ugyldig seksjon.', 'validation', { sectionId: ['Ugyldig seksjon'] });
      }

      const flags: Record<string, boolean> = { ...existing.flags, ...data.flags };
      const explicitSlug = data.slug && data.slug !== existing.slug;
      if (explicitSlug) flags[SLUG_LOCKED_FLAG] = true;
      const locked = Boolean(flags[SLUG_LOCKED_FLAG]) || Boolean(existing.firstPublishedAt);
      const slug = await resolveSlug(tx, {
        siteId: ctx.site.id,
        articleId: existing.id,
        current: existing.slug,
        requested: data.slug,
        title: data.title,
        locked,
      });

      const text = textFields(data.body);
      const now = new Date();
      const nextVersion = existing.version + 1;
      const [updated] = await tx
        .update(articles)
        .set({
          contentTypeId: contentType.id,
          sectionId: data.sectionId,
          kicker: data.kicker,
          title: data.title,
          lead: data.lead,
          slug,
          body: data.body,
          ...text,
          customFields: pickKnownCustomFields(contentType.fields, data.customFields),
          access: data.access,
          featuredMediaId: data.featuredMediaId,
          featuredCaption: data.featuredCaption,
          featuredCredit: data.featuredCredit,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          canonicalUrl: data.canonicalUrl,
          noIndex: data.noIndex,
          isBreaking: data.isBreaking,
          isSponsored: data.isSponsored,
          flags,
          assignedTo: data.assignedTo,
          deadlineAt: data.deadlineAt,
          plannedAt: data.plannedAt,
          version: nextVersion,
          updatedBy: ctx.user.id,
          updatedAt: now,
        })
        .where(and(eq(articles.id, existing.id), eq(articles.version, opts.expectedVersion)))
        .returning();
      if (!updated) throw new StaleVersionSignal();

      const tagIds = await existingTagIds(tx, ctx.site.id, data.tagIds);
      const authorIds = new Set(
        await existingAuthorIds(
          tx,
          ctx.site.id,
          data.bylines.map((b) => b.authorId),
        ),
      );
      const bylines: BylineRow[] = data.bylines.filter((b) => authorIds.has(b.authorId));
      const relatedIds = await existingArticleIds(tx, ctx.site.id, data.relatedIds, existing.id);
      await syncTags(tx, updated.id, tagIds);
      await syncBylines(tx, updated.id, bylines);
      await syncRelated(tx, updated.id, relatedIds);

      await recordRevision(tx, {
        articleId: updated.id,
        version: nextVersion,
        snapshot: buildSnapshot(updated, tagIds, bylines),
        kind: opts.kind,
        userId: ctx.user.id,
        now,
      });

      // An article that has been public and moves keeps its old address working (SPEC 5.3).
      if (everPublished && oldPath) {
        const newPath = await canonicalPath(tx, updated);
        if (newPath !== oldPath) await recordRedirect(tx, ctx.site.id, oldPath, newPath);
      }
      return updated;
    })
    .catch(async (err: unknown) => {
      // Someone saved between our version check and the update: report who, outside the transaction.
      if (err instanceof StaleVersionSignal)
        throw await conflictFor((await loadArticle(ctx.site.id, id)) ?? existing);
      throw err;
    });

  if (opts.kind === 'manual') {
    await auditFromContext(ctx, {
      action: 'article.save',
      entityType: 'article',
      entityId: result.id,
      summary: `Lagret «${titleOf(result)}» (versjon ${result.version})`,
    });
  }
  if (result.status === 'published') {
    revalidateArticle(ctx.site.id, result.id);
    await emitWebhook(ctx, 'article.updated', result);
  }
  return { article: result, version: result.version };
}

/** Thrown inside the save transaction when the conditional update matched no row. */
class StaleVersionSignal extends Error {}

async function conflictFor(current: Article): Promise<ConflictError> {
  let who = 'noen andre';
  if (current.updatedBy) {
    const { users } = await import('@/db/schema');
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, current.updatedBy))
      .limit(1);
    if (u) who = u.name;
  }
  return new ConflictError(
    `Saken ble lagret av ${who} ${formatDate(current.updatedAt, 'time')} (versjon ${current.version}). Last inn på nytt for å se endringene.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  Workflow transitions                                                       */
/* -------------------------------------------------------------------------- */

/** Which permission a transition target needs beyond being able to edit the article. */
function assertTransitionAllowed(ctx: AdminContext, article: Article, to: ArticleStatus): void {
  // Re-scheduling ("Endre tidspunkt") is the one same-state transition that makes sense.
  const reschedule = to === 'scheduled' && article.status === 'scheduled';
  if (!reschedule && !canTransition(article.status, to)) {
    throw new ActionError(`Kan ikke gå fra «${article.status}» til «${to}».`, 'validation');
  }
  switch (to) {
    case 'in_review':
      if (!canEditArticle(ctx, article)) throw new ForbiddenError();
      return;
    case 'draft':
      // Withdrawing from review is fine for the writer; leaving unpublished/archived needs the desk.
      if (article.status === 'in_review' || article.status === 'approved' || article.status === 'scheduled') {
        if (!canEditArticle(ctx, article) && !ctx.can('article:publish')) throw new ForbiddenError();
        if (article.status === 'scheduled') assertCan(ctx, 'article:publish');
        return;
      }
      assertCan(ctx, 'article:publish');
      return;
    default:
      assertCan(ctx, 'article:publish');
  }
}

export async function transition(
  ctx: AdminContext,
  id: string,
  to: ArticleStatus,
  opts: { scheduledAt?: Date | null; note?: string } = {},
): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (article.deletedAt) throw new ActionError('Saken ligger i papirkurven.', 'conflict');
  assertTransitionAllowed(ctx, article, to);

  if (to === 'published') return publishArticle(ctx, id);
  if (to === 'unpublished') return unpublishArticle(ctx, id);
  if (to === 'scheduled') {
    if (!opts.scheduledAt)
      throw new ActionError('Velg et publiseringstidspunkt.', 'validation', {
        scheduledAt: ['Velg et tidspunkt'],
      });
    return scheduleArticle(ctx, id, opts.scheduledAt);
  }

  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({
      status: to,
      scheduledAt: article.status === 'scheduled' ? null : article.scheduledAt,
      updatedBy: ctx.user.id,
      updatedAt: now,
    })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');

  const note = opts.note?.trim();
  if (note) {
    await db.insert(articleNotes).values({ articleId: article.id, userId: ctx.user.id, body: note });
  }

  await auditFromContext(ctx, {
    action: 'article.transition',
    entityType: 'article',
    entityId: article.id,
    summary: `«${titleOf(updated)}»: ${article.status} → ${to}`,
    data: { from: article.status, to, note: note || undefined },
  });

  const link = adminPaths.article(article.id);
  const title = titleOf(updated);
  if (to === 'in_review') {
    await notify(await deskUserIds(ctx.site.id, ctx.user.id), {
      siteId: ctx.site.id,
      kind: NOTIFY_KIND.reviewRequested,
      title: `«${title}» er sendt til desk`,
      body: note || `${ctx.user.name} ber om gjennomsyn.`,
      link,
    });
  } else if (to === 'approved') {
    await notify(await recipientsFor(updated, ctx.user.id), {
      siteId: ctx.site.id,
      kind: NOTIFY_KIND.approved,
      title: `«${title}» er godkjent`,
      body: note || `${ctx.user.name} godkjente saken.`,
      link,
    });
  } else if (to === 'draft' && (article.status === 'in_review' || article.status === 'approved')) {
    await notify(await recipientsFor(updated, ctx.user.id), {
      siteId: ctx.site.id,
      kind: NOTIFY_KIND.returned,
      title: `«${title}» er sendt tilbake til utkast`,
      body: note || `${ctx.user.name} sendte saken tilbake.`,
      link,
    });
  }
  if (article.status === 'unpublished' || article.status === 'archived')
    revalidateArticle(ctx.site.id, article.id);
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Publish / unpublish / schedule                                             */
/* -------------------------------------------------------------------------- */

/** Issues that would block or warn on publish, computed from stored data (used by the publish dialog). */
export async function getPublishIssues(
  ctx: AdminContext,
  id: string,
  scheduledAt?: Date | null,
): Promise<PublishIssue[]> {
  const article = await getEditableArticle(ctx, id);
  return computeIssues(ctx, article, scheduledAt ?? null);
}

async function computeIssues(
  ctx: AdminContext,
  article: Article,
  scheduledAt: Date | null,
): Promise<PublishIssue[]> {
  const relations = await loadRelations(db, article.id);
  const contentType = await loadContentType(db, ctx.site.id, article.contentTypeId);
  const mediaIds = [
    ...docMediaIds(article.body),
    ...(article.featuredMediaId ? [article.featuredMediaId] : []),
  ];
  const media = await getMediaMany(ctx.site.id, mediaIds);
  return validateForPublish(
    {
      title: article.title,
      lead: article.lead,
      sectionId: article.sectionId,
      body: article.body,
      featuredMediaId: article.featuredMediaId,
      featuredCredit: article.featuredCredit,
      bylines: relations.bylines,
      isSponsored: article.isSponsored,
      flags: article.flags ?? {},
      scheduledAt,
      customFields: article.customFields,
    },
    ctx.settings,
    media,
    contentType?.fields ?? [],
  );
}

function assertPublishable(issues: PublishIssue[]): void {
  if (hasBlockingIssues(issues)) {
    const errors = issues.filter((i) => i.level === 'error');
    throw new ActionError(
      errors.length === 1
        ? `Kan ikke publisere: ${errors[0]!.message}`
        : `Kan ikke publisere: ${errors.length} ting må rettes først.`,
      'validation',
      issuesToFieldErrors(issues),
    );
  }
}

export async function publishArticle(ctx: AdminContext, id: string): Promise<Article> {
  assertCan(ctx, 'article:publish');
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (article.deletedAt) throw new ActionError('Saken ligger i papirkurven.', 'conflict');
  if (article.status === 'published') throw new ActionError('Saken er allerede publisert.', 'conflict');
  if (!canTransition(article.status, 'published')) {
    throw new ActionError('Saken kan ikke publiseres fra denne statusen.', 'validation');
  }
  assertPublishable(await computeIssues(ctx, article, null));

  const now = new Date();
  const republishing = Boolean(article.firstPublishedAt && article.publishedAt);
  const updated = await db.transaction(async (tx) => {
    const previousPublish = await latestRevisionOfKind(tx, article.id, 'publish');
    const nextVersion = article.version + 1;
    const [row] = await tx
      .update(articles)
      .set({
        status: 'published',
        publishedAt: republishing ? article.publishedAt : now,
        firstPublishedAt: article.firstPublishedAt ?? now,
        scheduledAt: null,
        unpublishedAt: null,
        version: nextVersion,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(eq(articles.id, article.id), eq(articles.version, article.version)))
      .returning();
    if (!row) throw new ConflictError('Saken ble endret mens du publiserte. Last inn på nytt.');

    const relations = await loadRelations(tx, row.id);
    await recordRevision(tx, {
      articleId: row.id,
      version: nextVersion,
      snapshot: buildSnapshot(row, relations.tagIds, relations.bylines),
      kind: 'publish',
      userId: ctx.user.id,
      note: republishing ? 'Publisert på nytt' : 'Publisert',
      now,
    });

    // Redirect when the canonical address changed since the last publish.
    if (previousPublish) {
      const snap = previousPublish.snapshot;
      const oldPath = await canonicalPath(tx, { id: row.id, slug: snap.slug, sectionId: snap.sectionId });
      const newPath = await canonicalPath(tx, row);
      if (oldPath !== newPath) await recordRedirect(tx, ctx.site.id, oldPath, newPath);
    }
    return row;
  });

  await auditFromContext(ctx, {
    action: 'article.publish',
    entityType: 'article',
    entityId: updated.id,
    summary: `Publiserte «${titleOf(updated)}»`,
    data: { republished: republishing, from: article.status },
  });
  await notify(await recipientsFor(updated, ctx.user.id), {
    siteId: ctx.site.id,
    kind: NOTIFY_KIND.published,
    title: `«${titleOf(updated)}» er publisert`,
    body: `${ctx.user.name} publiserte saken.`,
    link: adminPaths.article(updated.id),
  });
  revalidateArticle(ctx.site.id, updated.id);
  await emitWebhook(ctx, 'article.published', updated);
  return updated;
}

export async function unpublishArticle(ctx: AdminContext, id: string): Promise<Article> {
  assertCan(ctx, 'article:publish');
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (article.status !== 'published') throw new ActionError('Saken er ikke publisert.', 'conflict');
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({ status: 'unpublished', unpublishedAt: now, updatedBy: ctx.user.id, updatedAt: now })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.unpublish',
    entityType: 'article',
    entityId: updated.id,
    summary: `Avpubliserte «${titleOf(updated)}»`,
  });
  await notify(await recipientsFor(updated, ctx.user.id), {
    siteId: ctx.site.id,
    kind: NOTIFY_KIND.unpublished,
    title: `«${titleOf(updated)}» er avpublisert`,
    body: `${ctx.user.name} avpubliserte saken.`,
    link: adminPaths.article(updated.id),
  });
  revalidateArticle(ctx.site.id, updated.id);
  await emitWebhook(ctx, 'article.unpublished', updated);
  return updated;
}

export async function scheduleArticle(ctx: AdminContext, id: string, at: Date): Promise<Article> {
  assertCan(ctx, 'article:publish');
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (article.deletedAt) throw new ActionError('Saken ligger i papirkurven.', 'conflict');
  if (article.status !== 'scheduled' && !canTransition(article.status, 'scheduled')) {
    throw new ActionError('Saken kan ikke planlegges fra denne statusen.', 'validation');
  }
  if (!(at instanceof Date) || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
    throw new ActionError('Publiseringstidspunktet må være fram i tid.', 'validation', {
      scheduledAt: ['Tidspunktet må være fram i tid'],
    });
  }
  assertPublishable(await computeIssues(ctx, article, at));
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({ status: 'scheduled', scheduledAt: at, updatedBy: ctx.user.id, updatedAt: now })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.schedule',
    entityType: 'article',
    entityId: updated.id,
    summary: `Planla «${titleOf(updated)}» til ${formatDate(at, 'datetime')}`,
    data: { scheduledAt: at.toISOString() },
  });
  await notify(await recipientsFor(updated, ctx.user.id), {
    siteId: ctx.site.id,
    kind: NOTIFY_KIND.scheduled,
    title: `«${titleOf(updated)}» er planlagt`,
    body: `Publiseres ${formatDate(at, 'datetime')}.`,
    link: adminPaths.article(updated.id),
  });
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Trash / restore / destroy                                                  */
/* -------------------------------------------------------------------------- */

export async function trashArticle(ctx: AdminContext, id: string): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (
    !ctx.can('article:delete') &&
    !(ctx.can('article:edit_own') && article.createdBy === ctx.user.id && article.status === 'draft')
  ) {
    throw new ForbiddenError('Du kan ikke slette denne saken.');
  }
  if (!canTrash(article.status))
    throw new ActionError('Publiserte saker må avpubliseres før de kan slettes.', 'conflict');
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({ deletedAt: now, lockedBy: null, lockedAt: null, updatedBy: ctx.user.id, updatedAt: now })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.trash',
    entityType: 'article',
    entityId: updated.id,
    summary: `La «${titleOf(updated)}» i papirkurven`,
  });
  revalidateArticle(ctx.site.id, updated.id);
  return updated;
}

export async function restoreArticle(ctx: AdminContext, id: string): Promise<Article> {
  assertCan(ctx, 'article:delete');
  const article = await loadArticle(ctx.site.id, id, { includeTrashed: true });
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (!article.deletedAt) return article;
  const now = new Date();
  const [updated] = await db
    .update(articles)
    .set({ deletedAt: null, updatedBy: ctx.user.id, updatedAt: now })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.restore',
    entityType: 'article',
    entityId: updated.id,
    summary: `Gjenopprettet «${titleOf(updated)}» fra papirkurven`,
  });
  return updated;
}

/** Permanently delete a trashed article (revisions, notes and junction rows cascade). */
export async function destroyArticle(ctx: AdminContext, id: string): Promise<void> {
  assertCan(ctx, 'article:delete');
  const article = await loadArticle(ctx.site.id, id, { includeTrashed: true });
  if (!article) throw new NotFoundError('Fant ikke saken.');
  if (!article.deletedAt)
    throw new ActionError('Legg saken i papirkurven før du sletter den permanent.', 'conflict');
  await db.delete(articles).where(and(eq(articles.id, article.id), eq(articles.siteId, ctx.site.id)));
  await auditFromContext(ctx, {
    action: 'article.destroy',
    entityType: 'article',
    entityId: article.id,
    summary: `Slettet «${titleOf(article)}» permanent`,
  });
  revalidateArticle(ctx.site.id, article.id);
}

/* -------------------------------------------------------------------------- */
/*  Duplicate, change type, restore revision                                   */
/* -------------------------------------------------------------------------- */

/** "Lag kopi": a fresh draft with the same content, tags, bylines and related articles. */
export async function duplicateArticle(ctx: AdminContext, id: string): Promise<Article> {
  assertCan(ctx, 'article:create');
  const source = await getEditableArticle(ctx, id);
  const relations = await loadRelations(db, source.id);
  const title = source.title.trim() ? `Kopi av ${source.title}` : '';
  const copy = await db.transaction(async (tx) => {
    const base = source.title.trim() ? `${source.slug.replace(/-\d+$/, '')}-kopi` : '';
    const slug = base
      ? await resolveSlug(tx, {
          siteId: ctx.site.id,
          articleId: '',
          current: '',
          requested: base,
          title,
          locked: false,
        })
      : await placeholderSlug(tx, ctx.site.id);
    const text = textFields(source.body);
    const [copy] = await tx
      .insert(articles)
      .values({
        siteId: ctx.site.id,
        contentTypeId: source.contentTypeId,
        sectionId: source.sectionId,
        kicker: source.kicker,
        title,
        lead: source.lead,
        slug,
        body: source.body,
        ...text,
        customFields: source.customFields,
        status: 'draft',
        access: source.access,
        featuredMediaId: source.featuredMediaId,
        featuredCaption: source.featuredCaption,
        featuredCredit: source.featuredCredit,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        canonicalUrl: null,
        noIndex: source.noIndex,
        isBreaking: false,
        isSponsored: source.isSponsored,
        flags: withoutChecklist(source.flags ?? {}),
        assignedTo: ctx.user.id,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
        version: 1,
      })
      .returning();
    if (!copy) throw new Error('Kunne ikke lage kopi.');
    await syncTags(tx, copy.id, relations.tagIds);
    await syncBylines(tx, copy.id, relations.bylines);
    await syncRelated(
      tx,
      copy.id,
      relations.relatedIds.filter((r) => r !== copy.id),
    );
    await recordRevision(tx, {
      articleId: copy.id,
      version: 1,
      snapshot: buildSnapshot(copy, relations.tagIds, relations.bylines),
      kind: 'manual',
      userId: ctx.user.id,
      note: `Kopi av «${titleOf(source)}»`,
    });
    return copy;
  });
  await auditFromContext(ctx, {
    action: 'article.duplicate',
    entityType: 'article',
    entityId: copy.id,
    summary: `Laget kopi av «${titleOf(source)}»`,
    data: { sourceId: source.id },
  });
  return copy;
}

/** Switch content type, keeping custom field values whose keys exist in the new type. */
export async function changeContentType(
  ctx: AdminContext,
  id: string,
  contentTypeId: string,
): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  assertEditable(ctx, article);
  if (article.contentTypeId === contentTypeId) return article;
  const target = await loadContentType(db, ctx.site.id, contentTypeId);
  if (!target || !target.isActive)
    throw new ActionError('Innholdstypen finnes ikke eller er deaktivert.', 'validation');
  const now = new Date();
  const nextVersion = article.version + 1;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(articles)
      .set({
        contentTypeId: target.id,
        customFields: pickKnownCustomFields(target.fields, article.customFields),
        version: nextVersion,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(eq(articles.id, article.id), eq(articles.version, article.version)))
      .returning();
    if (!row) throw new ConflictError();
    const relations = await loadRelations(tx, row.id);
    await recordRevision(tx, {
      articleId: row.id,
      version: nextVersion,
      snapshot: buildSnapshot(row, relations.tagIds, relations.bylines),
      kind: 'manual',
      userId: ctx.user.id,
      note: `Byttet innholdstype til ${target.name}`,
      now,
    });
    return row;
  });
  await auditFromContext(ctx, {
    action: 'article.change_type',
    entityType: 'article',
    entityId: updated.id,
    summary: `Byttet innholdstype for «${titleOf(updated)}» til ${target.name}`,
    data: { from: article.contentTypeId, to: target.id },
  });
  if (updated.status === 'published') revalidateArticle(ctx.site.id, updated.id);
  return updated;
}

/** Bring back the content of an earlier revision as a new version (kind 'restore'). */
export async function restoreRevision(ctx: AdminContext, id: string, revisionId: string): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  assertEditable(ctx, article);
  const revision = await getRevision(article.id, revisionId);
  if (!revision) throw new NotFoundError('Fant ikke versjonen.');
  const snap = revision.snapshot;
  const everPublished = Boolean(article.firstPublishedAt);
  const oldPath = everPublished ? await canonicalPath(db, article) : null;

  const updated = await db.transaction(async (tx) => {
    const sectionId =
      snap.sectionId && (await sectionBelongsToSite(tx, ctx.site.id, snap.sectionId)) ? snap.sectionId : null;
    const slug =
      snap.slug === article.slug || !(await slugExists(tx, ctx.site.id, snap.slug, article.id))
        ? snap.slug
        : article.slug;
    const contentType = await loadContentType(tx, ctx.site.id, article.contentTypeId);
    const now = new Date();
    const nextVersion = article.version + 1;
    const text = textFields(snap.body);
    const [row] = await tx
      .update(articles)
      .set({
        kicker: snap.kicker,
        title: snap.title,
        lead: snap.lead,
        slug,
        body: snap.body,
        ...text,
        customFields: pickKnownCustomFields(contentType?.fields ?? [], snap.customFields),
        sectionId,
        access: snap.access,
        featuredMediaId: snap.featuredMediaId,
        featuredCaption: snap.featuredCaption,
        featuredCredit: snap.featuredCredit,
        seoTitle: snap.seoTitle,
        seoDescription: snap.seoDescription,
        isBreaking: snap.isBreaking,
        isSponsored: snap.isSponsored,
        version: nextVersion,
        updatedBy: ctx.user.id,
        updatedAt: now,
      })
      .where(and(eq(articles.id, article.id), eq(articles.version, article.version)))
      .returning();
    if (!row) throw new ConflictError();
    const tagIds = await existingTagIds(tx, ctx.site.id, snap.tagIds ?? []);
    const authorIds = new Set(
      await existingAuthorIds(
        tx,
        ctx.site.id,
        (snap.bylines ?? []).map((b) => b.authorId),
      ),
    );
    const bylines = (snap.bylines ?? []).filter((b) => authorIds.has(b.authorId));
    await syncTags(tx, row.id, tagIds);
    await syncBylines(tx, row.id, bylines);
    await recordRevision(tx, {
      articleId: row.id,
      version: nextVersion,
      snapshot: buildSnapshot(row, tagIds, bylines),
      kind: 'restore',
      userId: ctx.user.id,
      note: `Gjenopprettet fra versjon ${revision.version}`,
      now,
    });
    if (everPublished && oldPath) {
      const newPath = await canonicalPath(tx, row);
      if (newPath !== oldPath) await recordRedirect(tx, ctx.site.id, oldPath, newPath);
    }
    return row;
  });

  await auditFromContext(ctx, {
    action: 'article.restore_revision',
    entityType: 'article',
    entityId: updated.id,
    summary: `Gjenopprettet «${titleOf(updated)}» fra versjon ${revision.version}`,
    data: { revisionId, fromVersion: revision.version, toVersion: updated.version },
  });
  if (updated.status === 'published') {
    revalidateArticle(ctx.site.id, updated.id);
    await emitWebhook(ctx, 'article.updated', updated);
  }
  return updated;
}

/** Word diff + field diff between two revisions of an article. */
export async function diffRevisions(
  ctx: AdminContext,
  id: string,
  fromRevisionId: string,
  toRevisionId: string,
): Promise<{
  from: { id: string; version: number };
  to: { id: string; version: number };
  diff: SnapshotDiff;
}> {
  const article = await getEditableArticle(ctx, id, { includeTrashed: true });
  const [from, to] = await Promise.all([
    getRevision(article.id, fromRevisionId),
    getRevision(article.id, toRevisionId),
  ]);
  if (!from || !to) throw new NotFoundError('Fant ikke versjonen.');
  const { resolveSnapshotValue } = await import('./taxonomy-lookup');
  const resolve = await resolveSnapshotValue(ctx.site.id, [from.snapshot, to.snapshot]);
  const [older, newer] = from.version <= to.version ? [from, to] : [to, from];
  return {
    from: { id: older.id, version: older.version },
    to: { id: newer.id, version: newer.version },
    diff: diffSnapshots(older.snapshot, newer.snapshot, resolve),
  };
}

/* -------------------------------------------------------------------------- */
/*  Checklist, notes, assignment, locks                                        */
/* -------------------------------------------------------------------------- */

/** Tick or untick a checklist item. Does not bump the version (no content changed). */
export async function toggleChecklistItem(
  ctx: AdminContext,
  id: string,
  itemId: string,
  checked: boolean,
): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  assertEditable(ctx, article);
  const item = ctx.settings.checklist.items.find((i) => i.id === itemId);
  if (!item) throw new ActionError('Ukjent sjekklistepunkt.', 'validation');
  const flags = { ...(article.flags ?? {}), [checklistFlag(itemId)]: checked };
  const [updated] = await db
    .update(articles)
    .set({ flags, updatedBy: ctx.user.id, updatedAt: new Date() })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.checklist',
    entityType: 'article',
    entityId: updated.id,
    summary: `${checked ? 'Haket av' : 'Fjernet haken for'} «${item.label}» på «${titleOf(updated)}»`,
    data: { itemId, checked },
  });
  return updated;
}

export async function addNote(ctx: AdminContext, id: string, body: string): Promise<ArticleNote> {
  const article = await getEditableArticle(ctx, id);
  const text = body.trim();
  if (!text) throw new ActionError('Skriv en melding.', 'validation', { body: ['Skriv en melding'] });
  const [note] = await db
    .insert(articleNotes)
    .values({ articleId: article.id, userId: ctx.user.id, body: text.slice(0, 5000) })
    .returning();
  if (!note) throw new Error('Kunne ikke lagre notatet.');
  await auditFromContext(ctx, {
    action: 'article.note',
    entityType: 'article',
    entityId: article.id,
    summary: `Skrev et notat på «${titleOf(article)}»`,
  });
  await notify(await recipientsFor(article, ctx.user.id), {
    siteId: ctx.site.id,
    kind: NOTIFY_KIND.note,
    title: `Nytt notat på «${titleOf(article)}»`,
    body: `${ctx.user.name}: ${text.slice(0, 200)}`,
    link: adminPaths.article(article.id),
  });
  return note;
}

export async function resolveNote(
  ctx: AdminContext,
  id: string,
  noteId: string,
  resolved = true,
): Promise<ArticleNote> {
  const article = await getEditableArticle(ctx, id);
  const [note] = await db
    .update(articleNotes)
    .set({ resolvedAt: resolved ? new Date() : null })
    .where(and(eq(articleNotes.id, noteId), eq(articleNotes.articleId, article.id)))
    .returning();
  if (!note) throw new NotFoundError('Fant ikke notatet.');
  return note;
}

export type AssignInput = { assignedTo: string | null; deadlineAt: Date | null; plannedAt: Date | null };

/** Planning fields; notifies a newly assigned user. Does not bump the version. */
export async function assignArticle(ctx: AdminContext, id: string, input: AssignInput): Promise<Article> {
  const article = await loadArticle(ctx.site.id, id);
  if (!article) throw new NotFoundError('Fant ikke saken.');
  assertEditable(ctx, article);
  if (input.assignedTo) {
    const { memberships } = await import('@/db/schema');
    const [m] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, input.assignedTo)))
      .limit(1);
    if (!m && !ctx.user.isSuperadmin) {
      throw new ActionError('Brukeren er ikke medlem av redaksjonen.', 'validation', {
        assignedTo: ['Ugyldig bruker'],
      });
    }
  }
  const [updated] = await db
    .update(articles)
    .set({
      assignedTo: input.assignedTo,
      deadlineAt: input.deadlineAt,
      plannedAt: input.plannedAt,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, article.id))
    .returning();
  if (!updated) throw new NotFoundError('Fant ikke saken.');
  await auditFromContext(ctx, {
    action: 'article.assign',
    entityType: 'article',
    entityId: updated.id,
    summary: `Oppdaterte planlegging for «${titleOf(updated)}»`,
    data: {
      assignedTo: input.assignedTo,
      deadlineAt: input.deadlineAt?.toISOString() ?? null,
      plannedAt: input.plannedAt?.toISOString() ?? null,
    },
  });
  if (input.assignedTo && input.assignedTo !== article.assignedTo && input.assignedTo !== ctx.user.id) {
    await notify([input.assignedTo], {
      siteId: ctx.site.id,
      kind: NOTIFY_KIND.assigned,
      title: `Du er tildelt «${titleOf(updated)}»`,
      body: input.deadlineAt
        ? `Frist ${formatDate(input.deadlineAt, 'datetime')}.`
        : `${ctx.user.name} tildelte deg saken.`,
      link: adminPaths.article(updated.id),
    });
  }
  return updated;
}

export { releaseLock };
