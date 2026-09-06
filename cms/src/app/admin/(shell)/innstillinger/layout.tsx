/**
 * Settings layout: page header plus route tabs for every settings area.
 * Requires settings:manage (integration:manage alone still shows the API
 * and webhook tabs owned by the integrations area).
 */
import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { LinkTabs, type LinkTabItem } from '@/components/ui/tabs';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getAdminContext();
  const canSettings = ctx.can('settings:manage');
  const canIntegrations = ctx.can('integration:manage');

  if (!canSettings && !canIntegrations) {
    return (
      <>
        <PageHeader title={t('settings.title')} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }

  const tabs: LinkTabItem[] = [];
  if (canSettings) {
    tabs.push(
      { href: adminPaths.settings(), label: t('settings.tabs.general'), exact: true },
      { href: adminPaths.settings('redaksjonelt'), label: t('settings.tabs.editorial') },
      { href: adminPaths.settings('utseende'), label: t('settings.tabs.theme') },
      { href: adminPaths.settings('menyer'), label: t('settings.tabs.menus') },
      { href: adminPaths.settings('sjekkliste'), label: t('settings.tabs.checklist') },
      { href: adminPaths.settings('pluss'), label: t('settings.tabs.paywall') },
      { href: adminPaths.settings('seo'), label: t('settings.tabs.seo') },
      { href: adminPaths.settings('analyse'), label: t('settings.tabs.analytics') },
      { href: adminPaths.settings('omdirigeringer'), label: t('settings.tabs.redirects') },
    );
  }
  if (canIntegrations) {
    tabs.push(
      { href: adminPaths.settings('api'), label: t('settings.tabs.api') },
      { href: adminPaths.settings('webhooks'), label: t('settings.tabs.webhooks') },
    );
  }
  if (ctx.can('site:manage')) {
    tabs.push({ href: adminPaths.settings('nettsteder'), label: t('settings.tabs.sites') });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('settings.title')}
        description={t('settings.description', { site: ctx.site.name })}
      />
      <LinkTabs items={tabs} aria-label={t('settings.tabsLabel')} />
      <div>{children}</div>
    </div>
  );
}
