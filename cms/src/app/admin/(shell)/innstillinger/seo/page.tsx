/** /admin/innstillinger/seo — title suffix, default description, OG image, X handle. */
import type { Metadata } from 'next';

import { SeoSettingsForm } from '@/components/settings/seo-form';
import { getAdminContext } from '@/server/auth/context';
import { getMedia } from '@/server/media/queries';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SEO' };

export default async function SeoSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  const ogId = ctx.settings.seo.ogImageMediaId;
  const ogImage = ogId ? await getMedia(ctx.site.id, ogId) : null;
  return (
    <SeoSettingsForm
      settings={ctx.settings}
      siteName={ctx.site.name}
      ogImage={ogImage && !ogImage.deletedAt ? ogImage : null}
      canUpload={ctx.can('media:upload')}
    />
  );
}
