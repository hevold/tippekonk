/** /admin/innstillinger/sjekkliste — the Vær Varsom pre-publish checklist. */
import type { Metadata } from 'next';

import { ChecklistSettingsForm } from '@/components/settings/checklist-form';
import { getAdminContext } from '@/server/auth/context';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sjekkliste' };

export default async function ChecklistSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  return <ChecklistSettingsForm settings={ctx.settings} />;
}
