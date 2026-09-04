/**
 * Audit log writer. Every mutation in the admin records who did what, to
 * which entity, from which IP. Entries are append-only and shown in
 * /admin/logg (settings area).
 *
 *   await audit({ user: ctx.user, site: ctx.site, ip: ctx.ip }, { action: 'article.publish', entityType: 'article', entityId, summary: 'Publiserte «Tittel»' });
 *   await auditFromContext(ctx, { action: 'user.invite', ... });
 *
 * Writing an audit row must never break the operation it documents, so
 * failures are logged and swallowed.
 */
import { db } from '@/db';
import { auditLog } from '@/db/schema';

export type AuditActor = {
  user?: { id: string } | null;
  site?: { id: string } | null;
  ip?: string | null;
};

export type AuditEntryInput = {
  /** Dotted action name, e.g. 'article.publish', 'user.invite', 'auth.login'. */
  action: string;
  entityType?: string;
  /** Must be a UUID when set (the column is uuid). */
  entityId?: string;
  summary?: string;
  data?: Record<string, unknown>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function audit(ctx: AuditActor, entry: AuditEntryInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      siteId: ctx.site?.id ?? null,
      userId: ctx.user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId && UUID_RE.test(entry.entityId) ? entry.entityId : null,
      summary: entry.summary ?? null,
      data: entry.data ?? null,
      ip: ctx.ip ?? null,
    });
  } catch (err) {
    console.error('[audit]', err);
  }
}

/** Convenience for code that already holds an AdminContext-shaped object. */
export async function auditFromContext(
  ctx: { user: { id: string }; site: { id: string }; ip: string | null },
  entry: AuditEntryInput,
): Promise<void> {
  await audit({ user: ctx.user, site: ctx.site, ip: ctx.ip }, entry);
}
