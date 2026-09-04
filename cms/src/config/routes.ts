/**
 * Public URL structure and reserved slugs.
 *
 *  /                         front page
 *  /[section]                section page          e.g. /nyheter
 *  /[section]/[slug]         article               e.g. /nyheter/kommunestyret-vedtok-budsjettet
 *  /a/[id]                   short link → redirects to canonical article URL
 *  /tag/[slug]               tag page
 *  /skribent/[slug]          author page
 *  /direkte/[slug]           live blog
 *  /sok?q=                   search
 *  /rss.xml, /[section]/rss.xml, /sitemap.xml, /robots.txt
 *  /media/[...key]           media files (originals and variants)
 *  /admin/**                 the newsroom admin
 *  /api/v1/**                public JSON API (API key)
 *  /api/**                   internal endpoints
 */

export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'media',
  'a',
  'sok',
  'tag',
  'stikkord',
  'skribent',
  'forfatter',
  'direkte',
  'rss.xml',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
  'manifest.webmanifest',
  '_next',
  'om',
  'nyhetsbrev',
  'plus',
  'pluss',
  'abonnement',
  'kontakt',
  'tips',
  'personvern',
  'preview',
  'forhandsvisning',
  'feed',
  'static',
  'public',
  'login',
  'logg-inn',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

export const publicPaths = {
  front: () => '/',
  section: (sectionSlug: string) => `/${sectionSlug}`,
  article: (sectionSlug: string | null | undefined, slug: string) =>
    sectionSlug ? `/${sectionSlug}/${slug}` : `/a/${slug}`,
  shortLink: (id: string) => `/a/${id}`,
  tag: (slug: string) => `/tag/${slug}`,
  author: (slug: string) => `/skribent/${slug}`,
  live: (slug: string) => `/direkte/${slug}`,
  search: (q?: string) => (q ? `/sok?q=${encodeURIComponent(q)}` : '/sok'),
  rss: (sectionSlug?: string) => (sectionSlug ? `/${sectionSlug}/rss.xml` : '/rss.xml'),
  media: (key: string) => `/media/${key}`,
};

export const adminPaths = {
  dashboard: () => '/admin',
  login: () => '/admin/login',
  logout: () => '/admin/logout',
  articles: () => '/admin/artikler',
  newArticle: () => '/admin/artikler/ny',
  article: (id: string) => `/admin/artikler/${id}`,
  articleRevisions: (id: string) => `/admin/artikler/${id}/versjoner`,
  preview: (id: string) => `/admin/forhandsvisning/${id}`,
  plan: () => '/admin/plan',
  media: () => '/admin/media',
  mediaItem: (id: string) => `/admin/media/${id}`,
  front: () => '/admin/forside',
  layout: (key: string) => `/admin/forside/${encodeURIComponent(key)}`,
  live: () => '/admin/direkte',
  liveBlog: (id: string) => `/admin/direkte/${id}`,
  sections: () => '/admin/seksjoner',
  tags: () => '/admin/stikkord',
  authors: () => '/admin/skribenter',
  contentTypes: () => '/admin/innholdstyper',
  users: () => '/admin/brukere',
  settings: (tab?: string) => (tab ? `/admin/innstillinger/${tab}` : '/admin/innstillinger'),
  audit: () => '/admin/logg',
  profile: () => '/admin/profil',
  notifications: () => '/admin/varsler',
};
