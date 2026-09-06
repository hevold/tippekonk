/**
 * Site footer (SPEC 7): contact, ansvarlig redaktør, utgiver, org.nr,
 * PFU/VVP statement, social links, RSS, personvern and the footer menu,
 * plus "Publisert med Desken".
 */
import { Rss } from 'lucide-react';

import { publicPaths } from '@/config/routes';
import type { Section, Site } from '@/db/schema';
import { t } from '@/lib/i18n';
import type { MenuItem, SiteSettings } from '@/lib/validation/site';

export type SiteFooterProps = {
  site: Pick<Site, 'name' | 'tagline'>;
  settings: SiteSettings;
  menu: MenuItem[];
  sections: Section[];
};

/** Default privacy page when the footer menu has none. */
const PRIVACY_PATH = '/personvern';

const SOCIAL_LABELS: Record<keyof SiteSettings['social'], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  bluesky: 'Bluesky',
};

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <h2 className="text-muted text-xs font-bold tracking-wide uppercase">{title}</h2>
      {children}
    </div>
  );
}

export function SiteFooter({ site, settings, menu, sections }: SiteFooterProps) {
  const { contact, editorial, social } = settings;
  const year = new Date().getFullYear();
  const socialLinks = (Object.keys(SOCIAL_LABELS) as (keyof SiteSettings['social'])[])
    .map((key) => ({ key, href: social[key], label: SOCIAL_LABELS[key] }))
    .filter((s) => /^https?:\/\//.test(s.href));
  const hasPrivacy = menu.some((m) => /personvern/i.test(m.href) || /personvern/i.test(m.label));
  const topSections = sections.filter((s) => s.showInMenu && !s.parentId);
  const address = [contact.address, [contact.postalCode, contact.city].filter(Boolean).join(' ')].filter(
    Boolean,
  );

  return (
    <footer className="site-footer border-border bg-surface-2 mt-16 border-t print:hidden" role="contentinfo">
      <div className="site-container grid grid-cols-1 gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <Column title={t('public.footer.contact')}>
          <p className="font-heading text-text text-lg font-bold">{site.name}</p>
          {address.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          ) : null}
          {contact.phone ? (
            <a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:underline">
              {contact.phone}
            </a>
          ) : null}
          {contact.tipsEmail || contact.tipsPhone ? (
            <p className="mt-1">
              <span className="font-semibold">{t('public.footer.tips')}: </span>
              {contact.tipsEmail ? (
                <a href={`mailto:${contact.tipsEmail}`} className="hover:underline">
                  {contact.tipsEmail}
                </a>
              ) : null}
              {contact.tipsEmail && contact.tipsPhone ? ' · ' : null}
              {contact.tipsPhone ? (
                <a href={`tel:${contact.tipsPhone.replace(/\s+/g, '')}`} className="hover:underline">
                  {contact.tipsPhone}
                </a>
              ) : null}
            </p>
          ) : null}
          {contact.secureTipsUrl ? (
            <a href={contact.secureTipsUrl} rel="noopener noreferrer" className="hover:underline">
              {t('public.footer.secureTips')}
            </a>
          ) : null}
        </Column>

        <Column title={t('public.footer.editorial')}>
          {editorial.responsibleEditor ? (
            <p>
              <span className="text-muted block text-xs">
                {editorial.responsibleEditorTitle || 'Ansvarlig redaktør'}
              </span>
              <span className="font-semibold">{editorial.responsibleEditor}</span>
            </p>
          ) : null}
          {editorial.publisher ? (
            <p>
              <span className="text-muted block text-xs">{t('public.footer.publisher')}</span>
              <span>{editorial.publisher}</span>
            </p>
          ) : null}
          {editorial.orgNumber ? (
            <p>
              <span className="text-muted block text-xs">{t('public.footer.orgNumber')}</span>
              <span className="tabular-nums">{editorial.orgNumber}</span>
            </p>
          ) : null}
          {editorial.editorialPolicyUrl ? (
            <a href={editorial.editorialPolicyUrl} className="hover:underline">
              {t('public.footer.editorialPolicy')}
            </a>
          ) : null}
        </Column>

        <Column title={t('public.menu.footer')}>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {topSections.map((s) => (
              <li key={s.id}>
                <a href={publicPaths.section(s.slug)} className="hover:underline">
                  {s.name}
                </a>
              </li>
            ))}
            {menu.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  target={item.target}
                  rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
                  className="hover:underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
            {!hasPrivacy ? (
              <li>
                <a href={PRIVACY_PATH} className="hover:underline">
                  {t('public.footer.privacy')}
                </a>
              </li>
            ) : null}
          </ul>
        </Column>

        <Column title={t('public.footer.followUs')}>
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0">
            {socialLinks.map((s) => (
              <li key={s.key}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
            <li>
              <a
                href={publicPaths.rss()}
                className="inline-flex items-center gap-1 hover:underline"
                type="application/rss+xml"
              >
                <Rss aria-hidden className="size-3.5" />
                {t('public.footer.rss')}
              </a>
            </li>
          </ul>
        </Column>
      </div>

      {editorial.showPressEthicsStatement && editorial.pressEthicsStatement ? (
        <div className="border-border border-t">
          <div className="site-container text-muted py-5 text-xs leading-relaxed">
            <p className="max-w-3xl">
              {editorial.pressEthicsStatement}{' '}
              <a
                href="https://presse.no/pfu/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text underline"
              >
                {t('public.footer.pfuLink')}
              </a>
            </p>
          </div>
        </div>
      ) : null}

      <div className="border-border border-t">
        <div className="site-container text-muted flex flex-col gap-2 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span>{t('public.footer.copyright', { year, publisher: editorial.publisher || site.name })}</span>
          <span>{t('public.footer.poweredBy')}</span>
        </div>
      </div>
    </footer>
  );
}
