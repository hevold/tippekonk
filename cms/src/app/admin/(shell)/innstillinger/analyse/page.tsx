/** /admin/innstillinger/analyse — Plausible / Umami / Matomo. */
import type { Metadata } from 'next';

import { AnalyticsSettingsForm } from '@/components/settings/analytics-form';
import { getAdminContext } from '@/server/auth/context';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Analyse' };

export default async function AnalyticsSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  return <AnalyticsSettingsForm settings={ctx.settings} />;
}
