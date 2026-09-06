/**
 * /admin/innstillinger/api — API keys for the public JSON API.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { env } from '@/env';
import { t } from '@/lib/i18n';
import { listApiKeys, toApiKeyDto } from '@/server/api-keys';
import { getAdminContext } from '@/server/auth/context';

import { ApiKeysClient } from './api-keys-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'API-nøkler' };

async function requestBaseUrl(): Promise<string> {
  const h = await headers();
  const host = (env.TRUST_PROXY ? h.get('x-forwarded-host') : null) ?? h.get('host');
  if (!host) return env.APP_URL.replace(/\/+$/, '');
  const proto =
    (env.TRUST_PROXY ? h.get('x-forwarded-proto') : null) ??
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function ApiKeysPage() {
  const ctx = await getAdminContext();
  const breadcrumbs = [
    { label: t('nav.settings'), href: adminPaths.settings() },
    { label: t('integrations.apiKeys.title') },
  ];
  if (!ctx.can('integration:manage')) {
    return (
      <>
        <PageHeader title={t('integrations.apiKeys.title')} breadcrumbs={breadcrumbs} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const [keys, baseUrl] = await Promise.all([listApiKeys(ctx.site.id), requestBaseUrl()]);
  return (
    <>
      <PageHeader
        title={t('integrations.apiKeys.title')}
        description={t('integrations.apiKeys.description')}
        breadcrumbs={breadcrumbs}
      />
      <ApiKeysClient
        keys={keys.map(toApiKeyDto)}
        baseUrl={baseUrl}
        canManage={ctx.can('integration:manage')}
      />
    </>
  );
}
