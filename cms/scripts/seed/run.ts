/**
 * Seed runner for the demo newsroom "Elvebyen Tidende" (docs/SPEC.md §10).
 *
 *   const summary = await runSeed({ force: false });  // null when already seeded
 *
 * Creates the site, users + memberships, authors, sections, content types,
 * tags, 12 generated images (sharp), ~24 articles with rich ContentDoc
 * bodies, revisions, views, related links, a live blog, the front layout,
 * menus, an API key and an inactive webhook — all inside one transaction so
 * a failure leaves nothing half-seeded. Migrations are applied first.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import { hash as argon2Hash } from '@node-rs/argon2';
import { asc, eq, inArray } from 'drizzle-orm';

import { dbDriver, getDb, type Db, type Tx } from '@/db';
import { runMigrations } from '@/db/migrate';
import {
  apiKeys,
  articleBylines,
  articleNotes,
  articleRelated,
  articleRevisions,
  articleTags,
  articleViews,
  articles,
  auditLog,
  authors,
  contentTypes,
  layouts,
  liveBlogs,
  livePosts,
  media,
  memberships,
  menus,
  notifications,
  sections,
  sites,
  tags,
  users,
  webhooks,
  type ArticleSnapshot,
  type Author,
  type ContentType,
  type MediaVariant,
  type Section,
  type Site,
  type Tag,
  type User,
} from '@/db/schema';
import { adminPaths } from '@/config/routes';
import type { LayoutDoc } from '@/lib/layout/types';
import { siteSettingsSchema, type MenuItem } from '@/lib/validation/site';

import {
  AGENCY_AUTHOR,
  ARTICLES,
  CONTENT_TYPES,
  DEMO_PASSWORD,
  LIVE_BLOG,
  SECTIONS,
  TAGS,
  USERS,
  assertContentIntegrity,
  type ArticleSpec,
  type AuthorKey,
  type BodyContext,
  type SectionKey,
  type UserKey,
} from './content';
import { textStats, type ImageRef } from './doc';
import { IMAGE_SPECS, deleteImageFiles, generateImage, type GeneratedImage } from './images';
import { slugify } from './slug';

export const SEED_SITE_SLUG = 'elvebyen';

export type SeedSummary = {
  driver: 'postgres' | 'pglite';
  site: { id: string; name: string; slug: string; domains: string[] };
  users: { email: string; name: string; role: string }[];
  password: string;
  /** Raw API key — shown once, only the SHA-256 hash is stored. */
  apiKey: string;
  uploadDir: string;
  counts: Record<string, number>;
};

export type SeedOptions = {
  /** Delete an existing 'elvebyen' site (cascade) and seed again. */
  force: boolean;
  log?: (message: string) => void;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** UTC offset of Europe/Oslo (in hours) at the given instant: +1 in winter, +2 in summer. */
function osloOffsetHours(d: Date): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Oslo', timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part ?? '');
  if (!m) return 1;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) + Number(m[3] ?? 0) / 60);
}

/** The instant of `hour:minute` Europe/Oslo on the calendar day `dayOffset` days from `now`'s Oslo date. */
function osloTime(now: Date, dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour - osloOffsetHours(d), minute, 0, 0);
  // Re-check the offset on the target day (DST switch between now and then).
  d.setUTCHours(hour - osloOffsetHours(d), minute, 0, 0);
  return d;
}

/** A timestamp `daysAgo` days back at `hour` local time; never in the future. */
function at(now: Date, daysAgo: number, hour: number, minute = 0): Date {
  const d = osloTime(now, -daysAgo, hour, minute);
  if (d.getTime() > now.getTime() - 60_000) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3_600_000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Deterministic pseudo-random 0..1 from a string (stable seed data across runs). */
function stableRandom(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

async function removeLocalFiles(
  uploadDir: string,
  rows: { storageKey: string; variants: Record<string, MediaVariant> }[],
) {
  for (const row of rows) await deleteImageFiles(uploadDir, row.storageKey, row.variants);
}

/* -------------------------------------------------------------------------- */
/*  Runner                                                                     */
/* -------------------------------------------------------------------------- */

export async function runSeed(opts: SeedOptions): Promise<SeedSummary | null> {
  const log = opts.log ?? ((m: string) => console.info(m));
  const { env } = await import('@/env');
  assertContentIntegrity();

  const db = await getDb();
  const driver = dbDriver() ?? (env.DATABASE_URL ? 'postgres' : 'pglite');
  await runMigrations(db, driver, { quiet: true });

  const uploadDir = path.resolve(env.UPLOAD_DIR);

  /* ---- Idempotency ------------------------------------------------------ */
  const [existing] = await db.select().from(sites).where(eq(sites.slug, SEED_SITE_SLUG)).limit(1);
  if (existing) {
    if (!opts.force) {
      log(
        `[seed] Nettstedet «${existing.name}» (${SEED_SITE_SLUG}) finnes allerede. Bruk --force for å slette og seede på nytt.`,
      );
      return null;
    }
    log(`[seed] --force: sletter nettstedet «${existing.name}» og demo-brukerne …`);
    if (env.STORAGE_DRIVER === 'local') {
      const rows = await db
        .select({ storageKey: media.storageKey, variants: media.variants })
        .from(media)
        .where(eq(media.siteId, existing.id));
      await removeLocalFiles(uploadDir, rows);
    }
    await db.delete(sites).where(eq(sites.id, existing.id));
    await db.delete(users).where(
      inArray(
        users.email,
        USERS.map((u) => u.email),
      ),
    );
  }

  /* ---- Files first (outside the transaction) --------------------------- */
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  log(`[seed] Genererer ${IMAGE_SPECS.length} bilder under ${uploadDir}/${prefix} …`);
  const generated: GeneratedImage[] = [];
  try {
    for (const spec of IMAGE_SPECS) generated.push(await generateImage(spec, uploadDir, { prefix }));
  } catch (err) {
    await removeLocalFiles(
      uploadDir,
      generated.map((g) => ({ storageKey: g.row.storageKey, variants: g.row.variants ?? {} })),
    );
    throw err;
  }

  log('[seed] Hasher passord …');
  const passwordHash = await argon2Hash(DEMO_PASSWORD);
  const rawApiKey = `dsk_${randomBytes(24).toString('base64url')}`;

  try {
    const summary = await db.transaction(async (tx) => {
      const counts: Record<string, number> = {};
      const count = (key: string, n: number) => (counts[key] = (counts[key] ?? 0) + n);

      /* ---- Site -------------------------------------------------------- */
      const settings = siteSettingsSchema.parse({
        theme: {
          primary: '#0b3d91',
          accent: '#d9291c',
          fontHeading: 'serif',
          fontBody: 'sans',
          radius: 'sm',
        },
        masthead: { showTagline: true, showDate: true },
        contact: {
          address: 'Storgata 12',
          postalCode: '9999',
          city: 'Elvebyen',
          email: 'redaksjonen@elvebyen.no',
          phone: '99 00 10 00',
          tipsEmail: 'tips@elvebyen.no',
          tipsPhone: '99 00 10 10',
          secureTipsUrl: 'https://signal.me/#eu/elvebyentidende',
        },
        editorial: {
          responsibleEditor: 'Marit Solheim',
          responsibleEditorTitle: 'Ansvarlig redaktør',
          publisher: 'Elvebyen Tidende AS',
          orgNumber: '987 654 321',
          showPressEthicsStatement: true,
          editorialPolicyUrl: '/om',
        },
        social: {
          facebook: 'https://www.facebook.com/elvebyentidende',
          instagram: 'https://www.instagram.com/elvebyentidende',
        },
        paywall: { enabled: true, label: 'Pluss', teaserParagraphs: 2, ctaUrl: '/abonnement' },
        seo: {
          titleSuffix: ' – Elvebyen Tidende',
          defaultDescription: 'Uavhengig lokalavis for Elvebyen og omegn.',
        },
        frontPage: { breakingBar: true, latestCount: 10 },
        editor: { requireLead: true, requireFeaturedImage: false, titleMaxLength: 90 },
      });
      const [site] = await tx
        .insert(sites)
        .values({
          slug: SEED_SITE_SLUG,
          name: 'Elvebyen Tidende',
          tagline: 'Uavhengig lokalavis for Elvebyen og omegn',
          domains: ['localhost', '127.0.0.1'],
          locale: 'nb',
          timezone: 'Europe/Oslo',
          settings,
          isActive: true,
        })
        .returning();
      if (!site) throw new Error('seed: site insert returned no row');
      count('sites', 1);

      /* ---- Users + memberships ---------------------------------------- */
      const userByKey = new Map<UserKey, User>();
      for (const spec of USERS) {
        const [row] = await tx
          .insert(users)
          .values({
            email: spec.email,
            name: spec.name,
            passwordHash,
            locale: 'nb',
            isSuperadmin: spec.isSuperadmin,
            isActive: true,
            emailVerifiedAt: now,
          })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              name: spec.name,
              passwordHash,
              isSuperadmin: spec.isSuperadmin,
              isActive: true,
              updatedAt: now,
            },
          })
          .returning();
        if (!row) throw new Error(`seed: user insert failed for ${spec.email}`);
        userByKey.set(spec.key, row);
      }
      const user = (key: UserKey): User => {
        const u = userByKey.get(key);
        if (!u) throw new Error(`seed: missing user ${key}`);
        return u;
      };
      await tx
        .insert(memberships)
        .values(USERS.map((u) => ({ userId: user(u.key).id, siteId: site.id, role: u.role })))
        .onConflictDoNothing();
      count('users', USERS.length);

      /* ---- Authors ----------------------------------------------------- */
      const authorByKey = new Map<AuthorKey, Author>();
      const authorRows = await tx
        .insert(authors)
        .values([
          ...USERS.map((u, i) => ({
            siteId: site.id,
            userId: user(u.key).id,
            name: u.name,
            slug: slugify(u.name),
            title: u.title,
            bio: u.bio,
            email: u.email,
            phone: u.phone,
            sortOrder: i,
          })),
          {
            siteId: site.id,
            userId: null,
            name: AGENCY_AUTHOR.name,
            slug: AGENCY_AUTHOR.slug,
            title: AGENCY_AUTHOR.title,
            bio: AGENCY_AUTHOR.bio,
            sortOrder: USERS.length,
          },
        ])
        .returning();
      for (const u of USERS) {
        const a = authorRows.find((r) => r.userId === user(u.key).id);
        if (!a) throw new Error(`seed: missing author for ${u.key}`);
        authorByKey.set(u.key, a);
      }
      const ntb = authorRows.find((r) => r.slug === AGENCY_AUTHOR.slug);
      if (!ntb) throw new Error('seed: missing NTB author');
      authorByKey.set('ntb', ntb);
      const author = (key: AuthorKey): Author => {
        const a = authorByKey.get(key);
        if (!a) throw new Error(`seed: missing author ${key}`);
        return a;
      };
      count('authors', authorRows.length);

      /* ---- Sections (parents first) ----------------------------------- */
      const sectionByKey = new Map<SectionKey, Section>();
      for (const [i, spec] of SECTIONS.filter((s) => !s.parent).entries()) {
        const [row] = await tx
          .insert(sections)
          .values({
            siteId: site.id,
            name: spec.name,
            slug: spec.slug,
            description: spec.description,
            color: spec.color,
            sortOrder: i,
            showInMenu: spec.showInMenu,
            seoTitle: spec.name,
            seoDescription: spec.description,
          })
          .returning();
        if (!row) throw new Error(`seed: section insert failed for ${spec.key}`);
        sectionByKey.set(spec.key, row);
      }
      for (const [i, spec] of SECTIONS.filter((s) => s.parent).entries()) {
        const parent = spec.parent ? sectionByKey.get(spec.parent) : undefined;
        if (!parent) throw new Error(`seed: missing parent section for ${spec.key}`);
        const [row] = await tx
          .insert(sections)
          .values({
            siteId: site.id,
            parentId: parent.id,
            name: spec.name,
            slug: spec.slug,
            description: spec.description,
            color: spec.color,
            sortOrder: 100 + i,
            showInMenu: spec.showInMenu,
          })
          .returning();
        if (!row) throw new Error(`seed: section insert failed for ${spec.key}`);
        sectionByKey.set(spec.key, row);
      }
      const section = (key: SectionKey): Section => {
        const s = sectionByKey.get(key);
        if (!s) throw new Error(`seed: missing section ${key}`);
        return s;
      };
      count('sections', SECTIONS.length);

      /* ---- Content types ---------------------------------------------- */
      const typeRows = await tx
        .insert(contentTypes)
        .values(
          CONTENT_TYPES.map((c, i) => ({
            siteId: site.id,
            key: c.key,
            name: c.name,
            description: c.description,
            icon: c.icon,
            template: c.template,
            isDefault: c.isDefault,
            fields: c.fields,
            sortOrder: i,
          })),
        )
        .returning();
      const contentType = (key: string): ContentType => {
        const c = typeRows.find((r) => r.key === key);
        if (!c) throw new Error(`seed: missing content type ${key}`);
        return c;
      };
      count('contentTypes', typeRows.length);

      /* ---- Tags -------------------------------------------------------- */
      const tagRows = await tx
        .insert(tags)
        .values(
          TAGS.map((t) => ({ siteId: site.id, name: t.name, slug: t.slug, description: t.description })),
        )
        .returning();
      const tag = (slug: string): Tag => {
        const t = tagRows.find((r) => r.slug === slug);
        if (!t) throw new Error(`seed: missing tag ${slug}`);
        return t;
      };
      count('tags', tagRows.length);

      /* ---- Media ------------------------------------------------------- */
      const uploader = user('marit');
      const mediaRows = await tx
        .insert(media)
        .values(
          generated.map((g, i) => ({
            ...g.row,
            siteId: site.id,
            uploadedBy: uploader.id,
            createdAt: at(now, 28 - i * 2, 9, i * 5),
            updatedAt: at(now, 28 - i * 2, 9, i * 5),
          })),
        )
        .returning();
      const imageRefs: Record<string, ImageRef> = {};
      for (const g of generated) {
        const row = mediaRows.find((m) => m.id === g.id);
        if (!row) throw new Error(`seed: media row missing for ${g.spec.key}`);
        imageRefs[g.spec.key] = {
          id: row.id,
          alt: row.alt ?? g.spec.alt,
          caption: row.caption ?? g.spec.caption,
          credit: row.credit ?? 'Foto: Elvebyen Tidende',
          width: row.width ?? 1600,
          height: row.height ?? 1000,
        };
      }
      const imageRef = (key: string): ImageRef => {
        const r = imageRefs[key];
        if (!r) throw new Error(`seed: missing image ${key}`);
        return r;
      };
      count('media', mediaRows.length);

      /* ---- Articles ---------------------------------------------------- */
      const ids: Record<string, string> = {};
      for (const a of ARTICLES) ids[a.key] = randomUUID();
      const liveBlogId = randomUUID();
      const bodyCtx: BodyContext = { ids, images: imageRefs, liveBlogId };

      const usedSlugs = new Set<string>();
      const slugFor = (title: string): string => {
        const base = slugify(title) || 'sak';
        let candidate = base;
        let n = 2;
        while (usedSlugs.has(candidate)) candidate = `${base}-${n++}`;
        usedSlugs.add(candidate);
        return candidate;
      };

      const vaktsjef = user('jonas');
      const timing = (spec: ArticleSpec, index: number) => {
        const minute = (index * 17) % 60;
        const base = at(now, spec.daysAgo, spec.hour, minute);
        const published = ['published', 'unpublished', 'archived'].includes(spec.status);
        const publishedAt = published ? base : null;
        let updatedAt = base;
        let unpublishedAt: Date | null = null;
        let scheduledAt: Date | null = null;
        if (spec.status === 'unpublished') {
          unpublishedAt = addHours(base, 26);
          updatedAt = unpublishedAt;
        } else if (spec.status === 'archived') {
          updatedAt = addDays(base, 2);
        } else if (spec.status === 'scheduled') {
          // Clearly in the future at seed time (tomorrow 08:00 Europe/Oslo at the earliest), so the
          // scheduler leaves it alone for at least six hours; tests must not count on it staying
          // scheduled forever nor on an exact number of published articles.
          scheduledAt = osloTime(now, Math.max(1, spec.scheduleInDays ?? 1), 8);
        }
        const createdAt = addHours(base, -3);
        return { publishedAt, updatedAt, unpublishedAt, scheduledAt, createdAt };
      };

      for (const [index, spec] of ARTICLES.entries()) {
        const body = spec.body(bodyCtx);
        const stats = textStats(body);
        const t = timing(spec, index);
        const featured = spec.image ? imageRef(spec.image) : null;
        const creator = user(spec.createdBy);
        const version = (spec.revisionTitles?.length ?? 0) + 1;
        const sectionId = spec.section ? section(spec.section).id : null;
        const slug = slugFor(spec.title);
        const isPublishedNow = spec.status === 'published';

        const [row] = await tx
          .insert(articles)
          .values({
            id: ids[spec.key],
            siteId: site.id,
            contentTypeId: contentType(spec.contentType).id,
            sectionId,
            kicker: spec.kicker ?? null,
            title: spec.title,
            lead: spec.lead,
            slug,
            body,
            bodyText: stats.bodyText,
            customFields: spec.customFields ?? {},
            status: spec.status,
            access: spec.access ?? 'open',
            featuredMediaId: featured?.id ?? null,
            featuredCaption: spec.featuredCaption ?? null,
            featuredCredit: null,
            seoTitle: null,
            seoDescription: spec.seoDescription ?? null,
            isBreaking: spec.isBreaking ?? false,
            isSponsored: spec.isSponsored ?? false,
            flags: isPublishedNow
              ? {
                  'checklist:sources': true,
                  'checklist:rebuttal': true,
                  'checklist:title': true,
                  'checklist:images': true,
                }
              : {},
            publishedAt: t.publishedAt,
            firstPublishedAt: t.publishedAt,
            scheduledAt: t.scheduledAt,
            unpublishedAt: t.unpublishedAt,
            assignedTo:
              spec.status === 'in_review' ? vaktsjef.id : spec.status === 'draft' ? creator.id : null,
            deadlineAt: spec.status === 'draft' || spec.status === 'in_review' ? addDays(now, 2) : null,
            plannedAt: spec.status === 'draft' ? addDays(now, 3) : null,
            wordCount: stats.wordCount,
            readingTimeMin: stats.readingTimeMin,
            version,
            createdBy: creator.id,
            updatedBy: isPublishedNow ? vaktsjef.id : creator.id,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
          })
          .returning();
        if (!row) throw new Error(`seed: article insert failed for ${spec.key}`);

        const tagIds = spec.tags.map((s) => tag(s).id);
        if (tagIds.length) {
          await tx.insert(articleTags).values(tagIds.map((tagId) => ({ articleId: row.id, tagId })));
        }
        const bylineRows = spec.bylines.map((b, i) => ({
          articleId: row.id,
          authorId: author(b.author).id,
          role: b.role ?? ('text' as const),
          sortOrder: i,
        }));
        await tx.insert(articleBylines).values(bylineRows);

        const snapshot: ArticleSnapshot = {
          kicker: row.kicker,
          title: row.title,
          lead: row.lead,
          slug: row.slug,
          body: row.body,
          customFields: row.customFields,
          sectionId: row.sectionId,
          access: row.access,
          featuredMediaId: row.featuredMediaId,
          featuredCaption: row.featuredCaption,
          featuredCredit: row.featuredCredit,
          seoTitle: row.seoTitle,
          seoDescription: row.seoDescription,
          tagIds,
          bylines: bylineRows.map((b) => ({ authorId: b.authorId, role: b.role })),
          isBreaking: row.isBreaking,
          isSponsored: row.isSponsored,
        };
        const revisionValues: (typeof articleRevisions.$inferInsert)[] = (spec.revisionTitles ?? []).map(
          (title, i) => ({
            articleId: row.id,
            version: i + 1,
            kind: 'manual' as const,
            snapshot: { ...snapshot, title, slug: slugify(title) },
            note: i === 0 ? 'Første utkast' : null,
            createdBy: creator.id,
            createdAt: addHours(t.createdAt, i + 1),
          }),
        );
        revisionValues.push({
          articleId: row.id,
          version,
          kind: isPublishedNow ? ('publish' as const) : ('manual' as const),
          snapshot,
          note: isPublishedNow ? 'Publisert' : null,
          createdBy: isPublishedNow ? vaktsjef.id : creator.id,
          createdAt: t.publishedAt ?? t.updatedAt,
        });
        await tx.insert(articleRevisions).values(revisionValues);
        count('revisions', revisionValues.length);

        if (isPublishedNow && t.publishedAt) {
          const weight = spec.isBreaking ? 6 : spec.access === 'plus' ? 2 : 3;
          const views: { articleId: string; day: string; views: number }[] = [];
          for (let d = 0; d < 7; d++) {
            const day = addDays(now, -d);
            if (day.getTime() < t.publishedAt.getTime() - 86_400_000) continue;
            views.push({
              articleId: row.id,
              day: isoDay(day),
              views: Math.round(40 + stableRandom(`${spec.key}:${d}`) * 400 * weight) - d * 15,
            });
          }
          if (views.length) {
            await tx.insert(articleViews).values(views.map((v) => ({ ...v, views: Math.max(5, v.views) })));
            count('views', views.length);
          }
        }
      }
      count('articles', ARTICLES.length);

      for (const spec of ARTICLES) {
        const related = (spec.relatedKeys ?? []).filter((k) => ids[k]);
        if (!related.length) continue;
        await tx
          .insert(articleRelated)
          .values(related.map((k, i) => ({ articleId: ids[spec.key]!, relatedId: ids[k]!, sortOrder: i })));
        count('related', related.length);
      }

      /* ---- Editorial notes + notification for the in_review article --- */
      const inReview = ARTICLES.find((a) => a.status === 'in_review');
      if (inReview) {
        const articleId = ids[inReview.key]!;
        await tx.insert(articleNotes).values([
          {
            articleId,
            userId: user(inReview.createdBy).id,
            body: 'Sendt til desk. Mangler kanskje et bilde av selve utstillingen – kan vi få et fra kulturhuset?',
            createdAt: addHours(now, -5),
          },
          {
            articleId,
            userId: vaktsjef.id,
            body: 'Sjekk om åpningen er klokka 13 eller 14 – programmet fra kulturhuset sier 14.',
            createdAt: addHours(now, -2),
          },
        ]);
        await tx.insert(notifications).values({
          userId: vaktsjef.id,
          siteId: site.id,
          kind: 'article.review_requested',
          title: `${user(inReview.createdBy).name} sendte «${inReview.title}» til desk`,
          body: 'Saken venter på gjennomsyn.',
          link: adminPaths.article(articleId),
          createdAt: addHours(now, -5),
        });
        count('notes', 2);
        count('notifications', 1);
      }

      /* ---- Live blog --------------------------------------------------- */
      const [liveBlog] = await tx
        .insert(liveBlogs)
        .values({
          id: liveBlogId,
          siteId: site.id,
          articleId: ids[LIVE_BLOG.articleKey] ?? null,
          title: LIVE_BLOG.title,
          slug: LIVE_BLOG.slug,
          description: LIVE_BLOG.description,
          status: 'live',
          startedAt: new Date(now.getTime() - 420 * 60_000),
          createdBy: vaktsjef.id,
          createdAt: new Date(now.getTime() - 480 * 60_000),
          updatedAt: new Date(now.getTime() - 20 * 60_000),
        })
        .returning();
      if (!liveBlog) throw new Error('seed: live blog insert failed');
      await tx.insert(livePosts).values(
        LIVE_BLOG.posts.map((post) => {
          const postAuthor = author(post.author);
          return {
            liveBlogId: liveBlog.id,
            title: post.title,
            body: post.body(),
            authorId: postAuthor.id,
            isPinned: post.isPinned,
            isKeyEvent: post.isKeyEvent,
            publishedAt: new Date(now.getTime() - post.minutesAgo * 60_000),
            createdBy: postAuthor.userId ?? vaktsjef.id,
            createdAt: new Date(now.getTime() - post.minutesAgo * 60_000),
            updatedAt: new Date(now.getTime() - post.minutesAgo * 60_000),
          };
        }),
      );
      count('liveBlogs', 1);
      count('livePosts', LIVE_BLOG.posts.length);

      /* ---- Front layout ------------------------------------------------ */
      const frontLayout: LayoutDoc = {
        version: 1,
        rows: [
          {
            id: 'row-hero',
            kind: 'row',
            columns: 3,
            blocks: [
              {
                id: 'hero',
                type: 'hero',
                span: 2,
                settings: { limit: 1, showImages: true, showLead: true, showKicker: true, showBylines: true },
                items: [{ articleId: ids.budsjett! }],
              },
              {
                id: 'hero-list',
                type: 'list',
                span: 1,
                settings: { title: 'Siste nytt', limit: 6, showImages: true, showKicker: true },
              },
            ],
          },
          {
            id: 'row-top',
            kind: 'row',
            columns: 1,
            blocks: [
              {
                id: 'top-stories',
                type: 'top-stories',
                settings: { limit: 4, showImages: true, showLead: true, showKicker: true },
                items: [{ articleId: ids.fotball_seier! }, { articleId: ids.elvefestivalen! }],
              },
            ],
          },
          {
            id: 'row-sections',
            kind: 'row',
            columns: 3,
            blocks: [
              {
                id: 'feed-nyheter',
                type: 'section-feed',
                settings: { title: 'Nyheter', sectionId: section('nyheter').id, limit: 4, showImages: true },
              },
              {
                id: 'feed-sport',
                type: 'section-feed',
                settings: { title: 'Sport', sectionId: section('sport').id, limit: 4, showImages: true },
              },
              {
                id: 'feed-kultur',
                type: 'section-feed',
                settings: { title: 'Kultur', sectionId: section('kultur').id, limit: 4, showImages: true },
              },
            ],
          },
          {
            id: 'row-opinion',
            kind: 'row',
            columns: 2,
            background: 'muted',
            blocks: [
              {
                id: 'opinion',
                type: 'opinion',
                settings: { title: 'Meninger', contentTypeKey: 'opinion', limit: 4, showBylines: true },
              },
              { id: 'most-read', type: 'most-read', settings: { title: 'Mest lest', limit: 5, days: 7 } },
            ],
          },
          {
            id: 'row-latest',
            kind: 'row',
            columns: 1,
            blocks: [
              {
                id: 'latest',
                type: 'latest',
                settings: { title: 'Siste saker', limit: 10, showImages: true },
              },
            ],
          },
        ],
      };
      await tx.insert(layouts).values({
        siteId: site.id,
        key: 'front',
        name: 'Forsiden',
        draft: frontLayout,
        published: frontLayout,
        publishedAt: now,
        updatedBy: vaktsjef.id,
      });
      count('layouts', 1);

      /* ---- Menus ------------------------------------------------------- */
      const menuSections = [...sectionByKey.values()]
        .filter((s) => s.showInMenu && !s.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const primary: MenuItem[] = menuSections.map((s) => {
        const children = [...sectionByKey.values()]
          .filter((c) => c.parentId === s.id)
          .map((c) => ({ id: c.slug, label: c.name, href: `/${c.slug}` }));
        return { id: s.slug, label: s.name, href: `/${s.slug}`, ...(children.length ? { children } : {}) };
      });
      const footer: MenuItem[] = [
        { id: 'om', label: 'Om oss', href: '/om' },
        { id: 'tips', label: 'Tips oss', href: 'mailto:tips@elvebyen.no' },
        { id: 'personvern', label: 'Personvern', href: '/personvern' },
        { id: 'abonnement', label: 'Abonnement', href: '/abonnement' },
      ];
      await tx.insert(menus).values([
        { siteId: site.id, key: 'primary', items: primary },
        { siteId: site.id, key: 'footer', items: footer },
      ]);
      count('menus', 2);

      /* ---- API key + webhook ------------------------------------------ */
      await tx.insert(apiKeys).values({
        siteId: site.id,
        name: 'Demo-nøkkel (seed)',
        keyPrefix: rawApiKey.slice(0, 8),
        keyHash: sha256Hex(rawApiKey),
        scopes: ['content:read'],
        createdBy: user('marit').id,
      });
      await tx.insert(webhooks).values({
        siteId: site.id,
        name: 'Eksempel: varsle Slack-integrasjon',
        url: 'https://example.com/hooks/desken',
        secret: randomBytes(32).toString('hex'),
        events: [
          'article.published',
          'article.updated',
          'article.unpublished',
          'layout.published',
          'live.post_created',
        ],
        isActive: false,
        createdBy: user('marit').id,
      });
      count('apiKeys', 1);
      count('webhooks', 1);

      /* ---- Audit ------------------------------------------------------- */
      await tx.insert(auditLog).values({
        siteId: site.id,
        userId: user('marit').id,
        action: 'seed.run',
        entityType: 'site',
        entityId: site.id,
        summary: 'Demoinnhold for Elvebyen Tidende ble opprettet av pnpm db:seed.',
        data: { articles: ARTICLES.length, media: mediaRows.length },
      });

      return {
        driver,
        site: { id: site.id, name: site.name, slug: site.slug, domains: site.domains },
        users: USERS.map((u) => ({
          email: u.email,
          name: u.name,
          role: u.isSuperadmin ? `${u.role} (superadmin)` : u.role,
        })),
        password: DEMO_PASSWORD,
        apiKey: rawApiKey,
        uploadDir,
        counts,
      } satisfies SeedSummary;
    });
    return summary;
  } catch (err) {
    await removeLocalFiles(
      uploadDir,
      generated.map((g) => ({ storageKey: g.row.storageKey, variants: g.row.variants ?? {} })),
    );
    throw err;
  }
}

/** Print the summary and the one-time credentials to the console. */
export function printSeedSummary(summary: SeedSummary): void {
  const lines = [
    '',
    '──────────────────────────────────────────────────────────────',
    ` Desken: demoinnhold for «${summary.site.name}» er klart (${summary.driver})`,
    '──────────────────────────────────────────────────────────────',
    ` Nettsted:   ${summary.site.slug}  (${summary.site.domains.join(', ')})`,
    ` Filer:      ${summary.uploadDir}`,
    '',
    ' Innlogging (/admin/login) – passord for alle: ' + summary.password,
    ...summary.users.map((u) => `   ${u.email.padEnd(26)} ${u.name.padEnd(16)} ${u.role}`),
    '',
    ' API-nøkkel (vises kun nå – kun SHA-256 lagres):',
    `   ${summary.apiKey}`,
    '',
    ' Opprettet: ' +
      Object.entries(summary.counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
    '──────────────────────────────────────────────────────────────',
    '',
  ];
  console.info(lines.join('\n'));
}

/** Convenience for callers that only need the site row. */
export async function getSeededSite(db: Db | Tx): Promise<Site | null> {
  const [row] = await db
    .select()
    .from(sites)
    .where(eq(sites.slug, SEED_SITE_SLUG))
    .orderBy(asc(sites.createdAt))
    .limit(1);
  return row ?? null;
}
