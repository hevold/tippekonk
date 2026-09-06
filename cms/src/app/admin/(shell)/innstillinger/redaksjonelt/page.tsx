/** /admin/innstillinger/redaksjonelt — editorial, contact, social, editor rules, reading, front page, feeds, live. */
import type { Metadata } from 'next';

import { EditorialSettingsForm } from '@/components/settings/editorial-form';
import { getAdminContext } from '@/server/auth/context';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Redaksjonelt' };

export default async function EditorialSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  return <EditorialSettingsForm settings={ctx.settings} />;
}
