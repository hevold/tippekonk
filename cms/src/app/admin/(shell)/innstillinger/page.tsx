/**
 * /admin/innstillinger — Generelt: name, tagline, slug, domains, locale,
 * timezone and active flag of the current site.
 */
import type { Metadata } from 'next';

import { GeneralSettingsForm } from '@/components/settings/general-form';
import { getAdminContext } from '@/server/auth/context';

import { SettingsForbidden } from './forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Innstillinger' };

export default async function GeneralSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  return <GeneralSettingsForm site={ctx.site} />;
}
