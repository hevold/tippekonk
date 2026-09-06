/**
 * Stable DTOs for the public JSON API. Field names and shapes are part of
 * the contract consumers build against, so additions are fine, renames are
 * not. Dates are ISO 8601 strings; URLs are absolute.
 */
import 'server-only';

import type { Author, ContentType, LiveBlog, Media, Menu, Section, Site, Tag } from '@/db/schema';
import { publicPaths } from '@/config/routes';
import type { ContentDoc } from '@/lib/content/types';
import type { ArticleTeaser } from '@/lib/layout/engine';
import type { SiteSettings } from '@/lib/validation/site';
import { mediaSrcSet, mediaUrl } from '@/server/media/urls';
import type { LivePostView } from '@/server/live';
// The content area's docToHtml() pulls in react-dom/server, which Next 16 refuses in route handlers;
// the public area's React-free serialiser produces the same markup with absolute URLs.
import { docToFeedHtml } from '@/server/public/html';

import type { ApiArticle, ApiByline, ApiTeaser } from './queries';

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export type ImageDto = {
  id: string;
  url: string;
  srcset: string;
  alt: string | null;
  caption: string | null;
  credit: string | null;
  width: number | null;
  height: number | null;
};

export type BylineDto = {
  id: string;
  name: string;
  slug: string;
  role: string;
  title: string | null;
  url: string;
};
export type TagDto = { id: string; name: string; slug: string; url: string; articleCount?: number };
export type SectionDto = {
  id: string;
  name: string;
  slug: string;
  url: string;
  parentId: string | null;
  description: string | null;
  color: string | null;
  showInMenu: boolean;
  articleCount?: number;
};

export type ArticleTeaserDto = {
  id: string;
  title: string;
  kicker: string | null;
  lead: string | null;
  slug: string;
  url: string;
  section: { id: string; name: string; slug: string } | null;
  contentType: string;
  tags: TagDto[];
  bylines: BylineDto[];
  access: 'open' | 'plus';
  publishedAt: string | null;
  updatedAt: string;
  featuredImage: ImageDto | null;
  readingTimeMin: number;
  isBreaking: boolean;
  isSponsored: boolean;
};

export type ArticleDto = ArticleTeaserDto & {
  firstPublishedAt: string | null;
  body: ContentDoc;
  html: string;
  wordCount: number;
  featuredCaption: string | null;
  featuredCredit: string | null;
  seo: { title: string | null; description: string | null; canonicalUrl: string | null };
  customFields: Record<string, unknown>;
  related: ArticleTeaserDto[];
};

export type AuthorDto = {
  id: string;
  name: string;
  slug: string;
  url: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  image: ImageDto | null;
  articleCount?: number;
};

export type LivePostDto = {
  id: string;
  title: string | null;
  body: ContentDoc;
  html: string;
  author: { id: string; name: string } | null;
  isPinned: boolean;
  isKeyEvent: boolean;
  publishedAt: string;
  updatedAt: string;
};

export type LiveBlogDto = {
  id: string;
  title: string;
  slug: string;
  url: string;
  description: string | null;
  status: LiveBlog['status'];
  articleId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
  posts: LivePostDto[];
  keyEvents: LivePostDto[];
};

export type SiteDto = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  url: string;
  locale: string;
  timezone: string;
  domains: string[];
  theme: SiteSettings['theme'];
  editorial: Pick<
    SiteSettings['editorial'],
    'responsibleEditor' | 'responsibleEditorTitle' | 'publisher' | 'orgNumber'
  >;
  contact: SiteSettings['contact'];
  social: SiteSettings['social'];
  paywall: Pick<SiteSettings['paywall'], 'enabled' | 'label'>;
  live: SiteSettings['live'];
  menus: Record<string, Menu['items']>;
  sections: SectionDto[];
  contentTypes: { key: string; name: string; template: string }[];
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function absolute(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function articleUrl(baseUrl: string, a: Pick<ArticleTeaser, 'id' | 'slug' | 'sectionSlug'>): string {
  return absolute(baseUrl, publicPaths.article(a.sectionSlug, a.sectionSlug ? a.slug : a.id));
}

export function serializeImage(baseUrl: string, m: Media | null | undefined): ImageDto | null {
  if (!m || m.deletedAt) return null;
  return {
    id: m.id,
    url: absolute(baseUrl, mediaUrl(m, 1280)),
    srcset: mediaSrcSet(m)
      .split(', ')
      .filter(Boolean)
      .map((part) => {
        const [u, w] = part.split(' ');
        return `${absolute(baseUrl, u ?? '')} ${w ?? ''}`.trim();
      })
      .join(', '),
    alt: m.alt,
    caption: m.caption,
    credit: m.credit,
    width: m.width,
    height: m.height,
  };
}

export function serializeByline(baseUrl: string, b: ApiByline): BylineDto {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    role: b.role,
    title: b.title,
    url: absolute(baseUrl, publicPaths.author(b.slug)),
  };
}

export function serializeTag(
  baseUrl: string,
  t: Pick<Tag, 'id' | 'name' | 'slug'> & { articleCount?: number },
): TagDto {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    url: absolute(baseUrl, publicPaths.tag(t.slug)),
    ...(t.articleCount !== undefined ? { articleCount: t.articleCount } : {}),
  };
}

export function serializeSection(baseUrl: string, s: Section & { articleCount?: number }): SectionDto {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    url: absolute(baseUrl, publicPaths.section(s.slug)),
    parentId: s.parentId,
    description: s.description,
    color: s.color,
    showInMenu: s.showInMenu,
    ...(s.articleCount !== undefined ? { articleCount: s.articleCount } : {}),
  };
}

/** Teaser DTO. Works for plain engine teasers too (bylines then lack ids/roles). */
export function serializeTeaser(baseUrl: string, a: ApiTeaser | ArticleTeaser): ArticleTeaserDto {
  const api = a as Partial<ApiTeaser> & ArticleTeaser;
  return {
    id: a.id,
    title: a.title,
    kicker: a.kicker,
    lead: a.lead,
    slug: a.slug,
    url: articleUrl(baseUrl, a),
    section:
      api.sectionId && a.sectionSlug && a.sectionName
        ? { id: api.sectionId, name: a.sectionName, slug: a.sectionSlug }
        : a.sectionSlug && a.sectionName
          ? { id: '', name: a.sectionName, slug: a.sectionSlug }
          : null,
    contentType: a.contentTypeKey,
    tags: (api.tags ?? []).map((t) => serializeTag(baseUrl, t)),
    bylines: a.bylines.map((b) =>
      serializeByline(baseUrl, {
        id: (b as ApiByline).id ?? '',
        name: b.name,
        slug: b.slug,
        role: (b as ApiByline).role ?? 'text',
        title: (b as ApiByline).title ?? null,
      }),
    ),
    access: a.access,
    publishedAt: iso(a.publishedAt),
    updatedAt: a.updatedAt.toISOString(),
    featuredImage: serializeImage(baseUrl, a.featuredMedia),
    readingTimeMin: a.readingTimeMin,
    isBreaking: a.isBreaking,
    isSponsored: a.isSponsored,
  };
}

export function serializeArticle(baseUrl: string, a: ApiArticle): ArticleDto {
  const html = docToFeedHtml(a.body, { baseUrl, media: a.bodyMedia, articles: a.bodyArticles });
  return {
    ...serializeTeaser(baseUrl, a),
    firstPublishedAt: iso(a.firstPublishedAt),
    body: a.body,
    html,
    wordCount: a.wordCount,
    featuredCaption: a.featuredCaption,
    featuredCredit: a.featuredCredit,
    seo: { title: a.seoTitle, description: a.seoDescription, canonicalUrl: a.canonicalUrl },
    customFields: a.customFields,
    related: [...a.bodyArticles.values()].map((r) => serializeTeaser(baseUrl, r)),
  };
}

export function serializeAuthor(
  baseUrl: string,
  a: Author & { image: Media | null; articleCount?: number },
): AuthorDto {
  return {
    id: a.id,
    name: a.name,
    slug: a.slug,
    url: absolute(baseUrl, publicPaths.author(a.slug)),
    title: a.title,
    bio: a.bio,
    email: a.email,
    image: serializeImage(baseUrl, a.image),
    ...(a.articleCount !== undefined ? { articleCount: a.articleCount } : {}),
  };
}

export function serializeLivePost(baseUrl: string, p: LivePostView, media: Map<string, Media>): LivePostDto {
  return {
    id: p.id,
    title: p.title,
    body: p.body,
    html: docToFeedHtml(p.body, { baseUrl, media, articles: new Map() }),
    author: p.authorId && p.authorName ? { id: p.authorId, name: p.authorName } : null,
    isPinned: p.isPinned,
    isKeyEvent: p.isKeyEvent,
    publishedAt: p.publishedAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeLiveBlog(
  baseUrl: string,
  blog: LiveBlog,
  posts: LivePostView[],
  keyEvents: LivePostView[],
  media: Map<string, Media>,
): LiveBlogDto {
  return {
    id: blog.id,
    title: blog.title,
    slug: blog.slug,
    url: absolute(baseUrl, publicPaths.live(blog.slug)),
    description: blog.description,
    status: blog.status,
    articleId: blog.articleId,
    startedAt: iso(blog.startedAt),
    endedAt: iso(blog.endedAt),
    updatedAt: blog.updatedAt.toISOString(),
    posts: posts.map((p) => serializeLivePost(baseUrl, p, media)),
    keyEvents: keyEvents.map((p) => serializeLivePost(baseUrl, p, media)),
  };
}

export function serializeSite(
  baseUrl: string,
  site: Site,
  settings: SiteSettings,
  menus: Menu[],
  sections: (Section & { articleCount?: number })[],
  contentTypes: ContentType[],
): SiteDto {
  return {
    id: site.id,
    slug: site.slug,
    name: site.name,
    tagline: site.tagline,
    url: baseUrl,
    locale: site.locale,
    timezone: site.timezone,
    domains: site.domains,
    theme: settings.theme,
    editorial: {
      responsibleEditor: settings.editorial.responsibleEditor,
      responsibleEditorTitle: settings.editorial.responsibleEditorTitle,
      publisher: settings.editorial.publisher,
      orgNumber: settings.editorial.orgNumber,
    },
    contact: settings.contact,
    social: settings.social,
    paywall: { enabled: settings.paywall.enabled, label: settings.paywall.label },
    live: settings.live,
    menus: Object.fromEntries(menus.map((m) => [m.key, m.items])),
    sections: sections.map((s) => serializeSection(baseUrl, s)),
    contentTypes: contentTypes.map((c) => ({ key: c.key, name: c.name, template: c.template })),
  };
}
