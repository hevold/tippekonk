/** /admin/innstillinger/pluss — paywall settings. */
import type { Metadata } from 'next';

import { PaywallSettingsForm } from '@/components/settings/paywall-form';
import { getAdminContext } from '@/server/auth/context';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pluss' };

export default async function PaywallSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  return <PaywallSettingsForm settings={ctx.settings} />;
}
