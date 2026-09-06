/**
 * Everything the public chrome (masthead, breaking bar, footer) needs for a
 * site, loaded through the cached queries: logo media, menus (with the
 * section fallback for the primary menu), sections and breaking stories.
 */
import 'server-only';

import { publicPaths } from '@/config/routes';
import type { Media, Section, Site } from '@/db/schema';
import type { ArticleTeaser } from '@/lib/layout/engine';
import type { MenuItem, SiteSettings } from '@/lib/validation/site';
import { getMediaMany } from '@/server/media/queries';

import { cachedRead } from './cached';
import { getBreaking, getMenus, listSections } from './queries';

export type SiteChrome = {
  logo: Media | null;
  ogImage: Media | null;
  primaryMenu: MenuItem[];
  footerMenu: MenuItem[];
  sections: Section[];
  breaking: ArticleTeaser[];
  tipsHref: string | null;
};

/** Primary menu from the `primary` menu row, else the sections with showInMenu (children nested). */
export function sectionsAsMenu(sections: Section[]): MenuItem[] {
  const top = sections.filter((s) => s.showInMenu && !s.parentId);
  return top.map((s) => {
    const children = sections
      .filter((c) => c.parentId === s.id && c.showInMenu)
      .map((c) => ({ id: c.id, label: c.name, href: publicPaths.section(c.slug) }));
    return {
      id: s.id,
      label: s.name,
      href: publicPaths.section(s.slug),
      ...(children.length ? { children } : {}),
    };
  });
}

export function tipsHrefFor(settings: SiteSettings, footerMenu: MenuItem[]): string | null {
  const fromMenu = footerMenu.find((m) => /tips/i.test(m.label) || /tips/i.test(m.href));
  if (fromMenu) return fromMenu.href;
  if (settings.contact.tipsEmail) return `mailto:${settings.contact.tipsEmail}`;
  if (settings.contact.secureTipsUrl) return settings.contact.secureTipsUrl;
  if (settings.contact.email) return `mailto:${settings.contact.email}`;
  return null;
}

async function loadBrandMedia(siteId: string, ids: string[]): Promise<Record<string, Media>> {
  const map = await getMediaMany(siteId, ids);
  return Object.fromEntries(map);
}

export async function getSiteChrome(site: Site, settings: SiteSettings): Promise<SiteChrome> {
  const brandIds = [settings.theme.logoMediaId, settings.seo.ogImageMediaId].filter((id): id is string =>
    Boolean(id),
  );
  const [menus, sections, breaking, brand] = await Promise.all([
    getMenus(site.id),
    listSections(site.id),
    settings.frontPage.breakingBar ? getBreaking(site.id) : Promise.resolve([]),
    brandIds.length
      ? cachedRead(loadBrandMedia, ['public', 'brand-media'], { siteId: site.id })(site.id, brandIds)
      : Promise.resolve<Record<string, Media>>({}),
  ]);
  const footerMenu = menus.footer ?? [];
  const primaryMenu = menus.primary && menus.primary.length ? menus.primary : sectionsAsMenu(sections);
  return {
    logo: (settings.theme.logoMediaId && brand[settings.theme.logoMediaId]) || null,
    ogImage: (settings.seo.ogImageMediaId && brand[settings.seo.ogImageMediaId]) || null,
    primaryMenu,
    footerMenu,
    sections,
    breaking,
    tipsHref: tipsHrefFor(settings, footerMenu),
  };
}
