/**
 * The public page frame: theme <style>, skip link, masthead, breaking bar,
 * <main>, footer. Shared by the (public) layout and the admin preview so
 * both look identical. Server component.
 */
import type { ReactNode } from 'react';

import type { Site } from '@/db/schema';
import { t } from '@/lib/i18n';
import type { SiteSettings } from '@/lib/validation/site';
import { cn } from '@/lib/utils';
import type { SiteChrome } from '@/server/public/chrome';
import { themeCss, themeVariables } from '@/server/public/theme';

import { BreakingBar } from './breaking-bar';
import { Masthead } from './masthead';
import { SiteFooter } from './site-footer';

export type SiteShellProps = {
  site: Site;
  settings: SiteSettings;
  chrome: SiteChrome;
  currentPath?: string;
  /** Rendered above the masthead (preview banner). */
  banner?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SiteShell({
  site,
  settings,
  chrome,
  currentPath,
  banner,
  children,
  className,
}: SiteShellProps) {
  const vars = themeVariables(settings.theme) as Record<string, string>;
  return (
    <div
      className={cn('site-root bg-bg font-body text-text flex min-h-screen flex-col', className)}
      style={vars}
      data-site={site.slug}
      data-dark-mode={settings.theme.darkMode}
    >
      <style dangerouslySetInnerHTML={{ __html: themeCss(settings.theme) }} />
      <a
        href="#innhold"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-[var(--site-radius)] focus:bg-[var(--site-primary)] focus:px-4 focus:py-2 focus:text-white"
      >
        {t('public.skipToContent')}
      </a>
      {banner}
      <Masthead
        site={site}
        settings={settings}
        logo={chrome.logo}
        menu={chrome.primaryMenu}
        currentPath={currentPath}
        tipsHref={chrome.tipsHref}
      />
      {settings.frontPage.breakingBar ? <BreakingBar articles={chrome.breaking} /> : null}
      <main id="innhold" className="site-container flex-1 py-6 md:py-8" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter site={site} settings={settings} menu={chrome.footerMenu} sections={chrome.sections} />
    </div>
  );
}
