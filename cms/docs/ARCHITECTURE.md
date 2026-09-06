# Desken — architecture

This document is for developers. The product/engineering contract is in
[SPEC.md](SPEC.md); this file explains how the code is put together and the
conventions you must follow when extending it.

## Overview

Desken is a single Next.js 16 application (App Router) that serves both the
public website and the newsroom admin from one deployment.

```
Browser ──► proxy.ts (cookie check, x-pathname, cache headers)
            ├── /admin/**      admin (dynamic, session-authenticated)
            ├── /api/**        route handlers (uploads, autosave, live, cron, v1)
            ├── /media/**      stored files (originals + WebP variants)
            └── /**            public site (server components, cached reads)
                     │
                     ▼
        src/server/**  services (permission → validate → tx → audit → notify → revalidate)
                     │
                     ▼
        src/db        Drizzle ORM ── postgres-js (DATABASE_URL) | PGlite (embedded)
```

### Runtime pieces

- **`src/instrumentation.ts`** runs once per server start (Node runtime):
  opens the database, applies pending migrations when `AUTO_MIGRATE` is on,
  and starts the in-process scheduler (`ENABLE_INTERNAL_SCHEDULER`).
- **`src/proxy.ts`** (Next 16's middleware) redirects anonymous `/admin`
  requests to the login page, injects `x-pathname`, and sets CDN cache
  headers on anonymous public GETs.
- **Scheduler** (`src/server/scheduler`) ticks every 30 s: publishes
  scheduled articles, delivers webhooks with exponential backoff, prunes
  autosave revisions, clears expired sessions/tokens and stale locks. The
  same `tick()` is exposed at `POST /api/cron/tick` (Bearer `CRON_SECRET`)
  for deployments that prefer external cron.

## Directory map

| Path | Purpose |
| --- | --- |
| `src/app/(public)` | Public website: front page, sections, articles, tags, authors, search, live blogs, feeds, sitemap, robots |
| `src/app/admin/(auth)` | Login, 2FA, invitation, password reset |
| `src/app/admin/(shell)` | The admin behind the sidebar shell: dashboard, articles, plan, media, front-page layouts, live, taxonomy, content types, users, settings, audit log |
| `src/app/api` | Route handlers: `upload`, `articles/[id]/{autosave,lock}`, `live/[id]/posts`, `beacon`, `cron/tick`, `health`, `v1/**` |
| `src/app/media/[...key]` | Serves stored media with immutable caching, ETag, HEAD and Range |
| `src/components/ui` | Design system (Radix + Tailwind), one family per file, barrel in `index.ts` |
| `src/components/admin` | Shell: sidebar, topbar, site switcher, command palette, notifications |
| `src/components/editor` | TipTap editor, custom nodes (image, gallery, embed, factbox, pullquote, related, live), slash menu |
| `src/components/article-editor` | The article page composition: main column, sidebar cards, publish dialog, revisions |
| `src/components/layout-editor` | Drag-and-drop front-page editor (dnd-kit) |
| `src/components/media` | `MediaImage`, `MediaPicker`, dropzone, focal-point picker |
| `src/components/public` | Masthead, teasers, layout renderer, article body, footer |
| `src/server/*` | Services per area (articles, media, layouts, live, settings, menus, redirects, taxonomy, content-types, dashboard, plan, auth, notifications, webhooks, api-keys, public, public-api, scheduler) |
| `src/lib/content` | Content document model: schema/sanitizer, renderer, plain-text projection, embed whitelist, HTML export |
| `src/lib/layout` | Layout document model, block definitions and the resolution engine |
| `src/lib/validation` | Zod schemas shared by client and server |
| `src/lib/i18n` | Translation (`t()`, `useT()`), bokmål source of truth, nynorsk/English overrides |
| `src/db` | Drizzle schema, client proxy, migration runner |
| `drizzle/` | Generated SQL migrations (never edit by hand; `pnpm db:generate`) |
| `scripts/` | `migrate`, `seed`, `reset` (tsx; load `.env.local` first) |
| `e2e/` | Playwright specs and global setup |

## Data model

All site-scoped tables carry `site_id`; one installation hosts many titles.
Key tables (see `src/db/schema.ts` for every column):

- `sites`, `users`, `memberships` (role per site), `sessions`, `auth_tokens`, `api_keys`
- `sections` (tree), `tags`, `authors` (bylines; may or may not be users), `content_types` (custom field definitions as JSON)
- `articles` (body as a ProseMirror JSON document, `body_text` projection, generated `search` tsvector with the `norwegian` configuration, workflow status, access open/plus, scheduling, planning, locks, versions), `article_tags`, `article_bylines`, `article_related`, `article_revisions` (full snapshots), `article_notes`, `article_views`, `redirects`
- `media` (original + variant metadata, focal point, credit/alt/caption)
- `layouts` (draft + published layout documents), `menus`
- `live_blogs`, `live_posts`
- `webhooks`, `webhook_deliveries`, `audit_log`, `notifications`

### Content documents

Articles store a bounded subset of TipTap/ProseMirror JSON (`ContentDoc`).
`sanitizeDoc()` enforces depth/size limits, strips unsafe link protocols and
unknown attributes. `renderDoc()` renders to React for the public site;
`docToHtml()` exports HTML for feeds and the API. Embeds are rendered only
from a URL whitelist (YouTube, Vimeo, NRK as iframes; others as link cards) –
no raw HTML ever comes from a document.

### Layouts

A layout is rows of blocks. Blocks pin articles and/or auto-fill from
queries (section, tag, latest, most-read, opinion, plus, live). The engine
(`src/lib/layout/engine.ts`) resolves a layout against a `LayoutSource`,
de-duplicating articles across the page, keeping sponsored content out of
auto-fill and plus content out of `latest` unless asked for.

## Request lifecycle and conventions

1. **Admin pages** are dynamic server components. Each starts with
   `const ctx = await getAdminContext()` (redirects when unauthenticated,
   resolves the active site and role) and gates UI with `ctx.can(...)`.
2. **Mutations** are server actions (`'use server'` files named
   `actions.ts`) returning `ActionResult<T>` via `runAction()`. The order is
   fixed: `requirePermission()` → Zod validation → `db.transaction()` when
   several rows change → `audit()` → `notify()` → `revalidatePublic()`.
3. **Database access** goes through the `db` proxy in `src/db/index.ts`.
   Inside `db.transaction(async (tx) => …)` every `db.*` call in the same
   async context is routed to `tx` (AsyncLocalStorage), so helpers such as
   `audit()` are safe to call inside a transaction on PGlite's single
   connection.
4. **Public reads** are wrapped with `cachedPublic()` (Next `unstable_cache`
   with `site:<id>` tags). Every content mutation calls `revalidatePublic()`
   or `revalidateArticle()`.
5. **Authentication**: argon2id password hashes, opaque session tokens
   (SHA-256 stored), httpOnly/SameSite cookies, optional TOTP with encrypted
   secrets, single-use invitation and reset tokens, in-memory rate limits.
6. **Permissions** are declared once in `src/lib/permissions.ts`
   (role → permissions). UI hiding is never the only check.
7. **i18n**: all UI copy goes through `t('area.key')` (server) or
   `useT()` (client). Bokmål is the source of truth in
   `src/lib/i18n/messages/nb/<area>.ts`.
8. **Media**: uploads are sniffed with `file-type`, EXIF is stripped,
   variants are generated with sharp at 320–1920 px WebP and never upscaled.
   `MediaImage` renders `<img srcset sizes>` with focal-point positioning.

## Testing

- `pnpm test` – Vitest. Service tests run against an in-memory PGlite
  database created by `useTestDb()` (`src/test/db.ts`) with migrations
  applied and a minimal seed.
- `pnpm e2e` – Playwright against a production build with its own seeded
  PGlite directory (`e2e/global-setup.ts`).
- CI (`.github/workflows/cms.yml`) runs typecheck, lint, unit tests, build and
  the e2e suite.

## Extending Desken

- **New content type**: no code needed – create it in *Innholdstyper* with
  custom fields. For a new public template, add a case in the public
  article renderer keyed on `contentType.template`.
- **New layout block**: add the type to `LayoutBlockType`, a definition in
  `src/lib/layout/blocks.ts`, resolution in the engine, a renderer in
  `src/components/public`, and settings UI in the layout editor.
- **New editor node**: add a TipTap extension under
  `src/components/editor/extensions`, allow it in `contentDocSchema`, and
  render it in `src/lib/content/render.tsx` (and `html.ts`).
- **Schema change**: edit `src/db/schema.ts`, run `pnpm db:generate`, commit
  the new migration. Never edit existing migrations.
