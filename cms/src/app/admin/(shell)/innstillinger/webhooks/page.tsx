/**
 * /admin/innstillinger/webhooks — outgoing webhooks and their deliveries.
 */
import type { Metadata } from 'next';

import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { env } from '@/env';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listWebhooks, WEBHOOK_EVENTS } from '@/server/webhooks';
import { toWebhookDto } from '@/server/webhooks/dto';

import { WebhooksClient } from './webhooks-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Webhooks' };

export default async function WebhooksPage() {
  const ctx = await getAdminContext();
  const breadcrumbs = [
    { label: t('nav.settings'), href: adminPaths.settings() },
    { label: t('integrations.webhooks.title') },
  ];
  if (!ctx.can('integration:manage')) {
    return (
      <>
        <PageHeader title={t('integrations.webhooks.title')} breadcrumbs={breadcrumbs} />
        <Alert variant="danger">{t('common.error.forbidden')}</Alert>
      </>
    );
  }
  const hooks = await listWebhooks(ctx.site.id);
  return (
    <>
      <PageHeader
        title={t('integrations.webhooks.title')}
        description={t('integrations.webhooks.description')}
        breadcrumbs={breadcrumbs}
      />
      <WebhooksClient
        webhooks={hooks.map(toWebhookDto)}
        events={WEBHOOK_EVENTS}
        canManage={ctx.can('integration:manage')}
        allowHttp={env.APP_URL.startsWith('http://')}
      />
    </>
  );
}
