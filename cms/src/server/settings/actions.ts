'use server';
/**
 * Settings server actions. Every settings page saves through
 * `updateSiteSettingsAction(section, input)`: the general section writes the
 * `sites` row, all others merge into `sites.settings`. Both audit a diff,
 * drop the site cache and revalidate the public site (see service.ts).
 */
import { refresh } from 'next/cache';

import type { Site } from '@/db/schema';
import type { SiteSettings } from '@/lib/validation/site';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { settingsSectionSchema } from './schema';
import { updateSiteGeneral, updateSiteSettings } from './service';

export type SettingsSaveResult =
  | { section: 'general'; site: Site; changed: string[] }
  | { section: Exclude<SettingsSectionName, 'general'>; settings: SiteSettings; changed: string[] };

type SettingsSectionName = ReturnType<typeof settingsSectionSchema.parse>;

export async function updateSiteSettingsAction(
  section: unknown,
  input: unknown,
): Promise<ActionResult<SettingsSaveResult>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    const name = settingsSectionSchema.parse(section);
    if (name === 'general') {
      const result = await updateSiteGeneral(ctx, input);
      refresh();
      return { section: 'general' as const, site: result.site, changed: result.changed };
    }
    const result = await updateSiteSettings(ctx, name, input);
    refresh();
    return { section: name, settings: result.settings, changed: result.changed };
  });
}
