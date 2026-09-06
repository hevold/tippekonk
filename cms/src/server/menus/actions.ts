'use server';
/**
 * Menu server actions (settings → Menyer).
 */
import { refresh } from 'next/cache';

import type { MenuItem } from '@/lib/validation/site';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';

import { saveMenu, type MenuKey } from './index';

export async function saveMenuAction(
  input: unknown,
): Promise<ActionResult<{ key: MenuKey; items: MenuItem[] }>> {
  return runAction(async () => {
    const ctx = await requirePermission('settings:manage');
    const saved = await saveMenu(ctx, input);
    refresh();
    return { key: saved.key as MenuKey, items: saved.items };
  });
}
