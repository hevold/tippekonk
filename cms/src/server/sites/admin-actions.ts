'use server';
/**
 * Superadmin site management actions (settings → Nettsteder). The logic
 * lives in src/server/settings/sites-service.ts; these wrappers add the
 * permission check, ActionResult conversion and a router refresh.
 */
import { refresh } from 'next/cache';
import { z } from 'zod';

import type { Site } from '@/db/schema';
import { runAction, type ActionResult } from '@/server/actions';
import { requirePermission } from '@/server/auth/guards';
import { createSite, deleteSite, setSiteActive, updateSite } from '@/server/settings/sites-service';

export async function createSiteAction(input: unknown): Promise<ActionResult<Site>> {
  return runAction(async () => {
    const ctx = await requirePermission('site:manage');
    const site = await createSite(ctx, input);
    refresh();
    return site;
  });
}

export async function updateSiteAction(id: unknown, input: unknown): Promise<ActionResult<Site>> {
  return runAction(async () => {
    const ctx = await requirePermission('site:manage');
    const site = await updateSite(ctx, id, input);
    refresh();
    return site;
  });
}

export async function setSiteActiveAction(id: unknown, active: unknown): Promise<ActionResult<Site>> {
  return runAction(async () => {
    const ctx = await requirePermission('site:manage');
    const site = await setSiteActive(ctx, id, z.boolean().parse(active));
    refresh();
    return site;
  });
}

export async function deleteSiteAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission('site:manage');
    const result = await deleteSite(ctx, input);
    refresh();
    return result;
  });
}
