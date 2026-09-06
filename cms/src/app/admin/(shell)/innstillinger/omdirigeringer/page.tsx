/** /admin/innstillinger/omdirigeringer — redirect list (filters in the URL), CRUD, import and test. */
import type { Metadata } from 'next';

import { RedirectsClient } from '@/components/settings/redirects-client';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listRedirects, redirectListSchema } from '@/server/redirects';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Omdirigeringer' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RedirectsSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  const sp = await searchParams;
  const parsed = redirectListSchema.safeParse({ q: first(sp.q), page: first(sp.page), sort: first(sp.sort) });
  const query = parsed.success ? parsed.data : redirectListSchema.parse({});
  const page = await listRedirects(ctx.site.id, query);
  return (
    <div className="grid gap-4">
      <p className="text-muted text-sm">{t('settings.redirects.description')}</p>
      <RedirectsClient
        page={{ ...page, items: page.items.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) }}
        query={{ q: query.q ?? '', sort: query.sort }}
      />
    </div>
  );
}
