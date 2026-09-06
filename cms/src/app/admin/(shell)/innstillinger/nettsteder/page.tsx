/** /admin/innstillinger/nettsteder — superadmin site management. */
import type { Metadata } from 'next';

import { SitesClient } from '@/components/settings/sites-client';
import { Alert } from '@/components/ui/alert';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listSitesForAdmin } from '@/server/settings/sites-service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Nettsteder' };

export default async function SitesSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('site:manage')) return <Alert variant="danger">{t('settings.sites.forbidden')}</Alert>;
  const sites = await listSitesForAdmin();
  return (
    <div className="grid gap-4">
      <p className="text-muted text-sm">{t('settings.sites.description')}</p>
      <SitesClient
        currentSiteId={ctx.site.id}
        sites={sites.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          tagline: s.tagline,
          domains: s.domains,
          locale: s.locale,
          timezone: s.timezone,
          isActive: s.isActive,
          members: s.members,
          articles: s.articles,
        }))}
      />
    </div>
  );
}
