/** /admin/innstillinger/utseende — theme colours, fonts, logo, masthead with live preview. */
import type { Metadata } from 'next';

import { ThemeSettingsForm } from '@/components/settings/theme-form';
import { getAdminContext } from '@/server/auth/context';
import { getMedia } from '@/server/media/queries';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Utseende' };

export default async function ThemeSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  const logoId = ctx.settings.theme.logoMediaId;
  const logo = logoId ? await getMedia(ctx.site.id, logoId) : null;
  return (
    <ThemeSettingsForm
      settings={ctx.settings}
      siteName={ctx.site.name}
      tagline={ctx.site.tagline}
      logo={logo && !logo.deletedAt ? logo : null}
      canUpload={ctx.can('media:upload')}
    />
  );
}
