/**
 * Masthead (SPEC 7): logo or site name, tagline, today's date in Norwegian
 * ("torsdag 4. september 2026"), the primary menu, search and "Tips oss".
 * Server component; the mobile toggle and the search input are the only
 * client parts.
 */
import { MediaImage } from '@/components/media/media-image';
import { publicPaths } from '@/config/routes';
import type { Media, Site } from '@/db/schema';
import { formatDate, toIso } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type { MenuItem, SiteSettings } from '@/lib/validation/site';
import { cn } from '@/lib/utils';

import { MenuToggle } from './menu-toggle';
import { SearchForm } from './search-form';

export type MastheadProps = {
  site: Pick<Site, 'name' | 'tagline'>;
  settings: SiteSettings;
  logo: Media | null;
  menu: MenuItem[];
  /** Path of the current page, to mark the active menu item. */
  currentPath?: string;
  /** Link for "Tips oss" (mailto: or a page). */
  tipsHref: string | null;
};

function isActive(item: MenuItem, currentPath: string | undefined): boolean {
  if (!currentPath) return false;
  if (item.href === currentPath) return true;
  return item.href !== '/' && currentPath.startsWith(`${item.href}/`);
}

function MenuList({
  items,
  currentPath,
  mobile,
}: {
  items: MenuItem[];
  currentPath?: string;
  mobile?: boolean;
}) {
  return (
    <ul
      className={cn(
        'm-0 list-none p-0',
        mobile ? 'flex flex-col' : 'flex scrollbar-none items-center gap-1 overflow-x-auto',
      )}
    >
      {items.map((item) => {
        const active = isActive(item, currentPath);
        return (
          <li key={item.id} className={cn(mobile ? 'border-border border-b last:border-0' : 'shrink-0')}>
            <a
              href={item.href}
              target={item.target}
              rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'block font-semibold whitespace-nowrap',
                mobile
                  ? 'px-5 py-3 text-base'
                  : 'hover:bg-surface-2 rounded-[var(--site-radius)] px-3 py-2 text-sm',
                active &&
                  (mobile
                    ? 'text-[var(--site-primary)]'
                    : 'text-[var(--site-primary)] shadow-[inset_0_-2px_0_var(--site-primary)]'),
              )}
            >
              {item.label}
            </a>
            {mobile && item.children?.length ? (
              <ul className="m-0 list-none p-0 pb-2">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a href={child.href} className="text-muted hover:text-text block px-8 py-1.5 text-sm">
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function Masthead({ site, settings, logo, menu, currentPath, tipsHref }: MastheadProps) {
  const now = new Date();
  const showDate = settings.masthead.showDate;
  const showTagline = settings.masthead.showTagline && Boolean(site.tagline);

  return (
    <header className="site-masthead border-border bg-surface relative border-b print:border-0" role="banner">
      <div className="site-container flex items-center justify-between gap-4 py-3 md:py-5">
        <div className="text-muted hidden min-w-0 flex-1 flex-col text-xs md:flex">
          {showDate ? <time dateTime={toIso(now).slice(0, 10)}>{formatDate(now, 'weekday')}</time> : null}
          {showTagline ? <span>{site.tagline}</span> : null}
        </div>
        <div className="flex min-w-0 flex-1 justify-start md:justify-center">
          <a
            href={publicPaths.front()}
            className="site-logo inline-flex items-center"
            aria-label={`${site.name} – ${t('public.frontPage')}`}
          >
            {logo ? (
              <MediaImage
                media={logo}
                alt={site.name}
                sizes="(min-width: 768px) 320px, 200px"
                targetWidth={640}
                priority
                className="site-logo-img h-10 w-auto max-w-[220px] object-contain md:h-14 md:max-w-[320px]"
              />
            ) : (
              <span className="font-heading text-2xl font-bold tracking-tight text-[var(--site-primary)] md:text-4xl">
                {site.name}
              </span>
            )}
          </a>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2 print:hidden">
          <div className="hidden md:block">
            <SearchForm siteName={site.name} />
          </div>
          {tipsHref ? (
            <a
              href={tipsHref}
              className="hidden h-9 items-center rounded-[var(--site-radius)] bg-[var(--site-accent)] px-3 text-sm font-semibold text-white hover:opacity-90 md:inline-flex"
            >
              {t('public.tipsUs')}
            </a>
          ) : null}
          <MenuToggle>
            <nav aria-label={t('public.menu.primary')} className="site-container py-2">
              <div className="px-1 py-2">
                <SearchForm siteName={site.name} size="large" />
              </div>
              <MenuList items={menu} currentPath={currentPath} mobile />
              {tipsHref ? (
                <a href={tipsHref} className="block px-5 py-3 font-semibold text-[var(--site-accent)]">
                  {t('public.tipsUs')}
                </a>
              ) : null}
            </nav>
          </MenuToggle>
        </div>
      </div>
      {menu.length ? (
        <nav
          aria-label={t('public.menu.primary')}
          className="border-border hidden border-t md:block print:hidden"
        >
          <div className="site-container">
            <MenuList items={menu} currentPath={currentPath} />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
