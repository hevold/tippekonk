/** /admin/innstillinger/menyer — primary, footer and topbar menus. */
import { asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';

import { MenusEditor } from '@/components/settings/menus-editor';
import { db } from '@/db';
import { sections, tags } from '@/db/schema';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { listMenus } from '@/server/menus';

import { SettingsForbidden } from '../forbidden';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menyer' };

export default async function MenusSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx.can('settings:manage')) return <SettingsForbidden />;
  const [menus, sectionRows, tagRows] = await Promise.all([
    listMenus(ctx.site.id),
    db
      .select({
        id: sections.id,
        name: sections.name,
        slug: sections.slug,
        parentId: sections.parentId,
        isActive: sections.isActive,
      })
      .from(sections)
      .where(eq(sections.siteId, ctx.site.id))
      .orderBy(asc(sections.sortOrder), asc(sections.name)),
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .where(eq(tags.siteId, ctx.site.id))
      .orderBy(asc(tags.name)),
  ]);
  return (
    <div className="grid gap-4">
      <p className="text-muted text-sm">{t('settings.menus.description')}</p>
      <MenusEditor menus={menus} sections={sectionRows.filter((s) => s.isActive)} tags={tagRows} />
    </div>
  );
}
