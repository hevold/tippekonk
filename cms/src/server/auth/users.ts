/**
 * Users admin service (/admin/brukere): list the members of a site and
 * change roles, activation, membership and the superadmin flag. Every
 * mutation checks `user:manage` (superadmin flag: superadmins only), refuses
 * to let admins lock themselves out, and writes an audit entry.
 */
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { memberships, users, type MemberRole, type User } from '@/db/schema';
import { t } from '@/lib/i18n';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';

import type { AdminContext } from './context';
import { assertCan } from './guards';
import { roleLabel, sendInvitation } from './invites';
import { deleteUserSessions } from './session';

export type MemberStatus = 'active' | 'invited' | 'inactive';

export type SiteMember = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  isSuperadmin: boolean;
  isActive: boolean;
  totpEnabled: boolean;
  status: MemberStatus;
  lastLoginAt: Date | null;
  memberSince: Date;
};

export function memberStatus(user: Pick<User, 'isActive' | 'passwordHash'>): MemberStatus {
  if (!user.isActive) return 'inactive';
  if (!user.passwordHash) return 'invited';
  return 'active';
}

export async function listSiteMembers(siteId: string): Promise<SiteMember[]> {
  const rows = await db
    .select({ user: users, role: memberships.role, memberSince: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.siteId, siteId))
    .orderBy(asc(users.name));
  return rows.map(({ user, role, memberSince }) => ({
    userId: user.id,
    name: user.name,
    email: user.email,
    role,
    isSuperadmin: user.isSuperadmin,
    isActive: user.isActive,
    totpEnabled: user.totpEnabled,
    status: memberStatus(user),
    lastLoginAt: user.lastLoginAt,
    memberSince,
  }));
}

async function getMember(ctx: AdminContext, userId: string): Promise<{ user: User; role: MemberRole }> {
  const rows = await db
    .select({ user: users, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError(t('users.error.notMember'));
  return row;
}

/** Count admins of the site other than `exceptUserId` (superadmins count as admins). */
async function otherAdminCount(siteId: string, exceptUserId: string): Promise<number> {
  const rows = await db
    .select({
      userId: memberships.userId,
      role: memberships.role,
      isSuperadmin: users.isSuperadmin,
      isActive: users.isActive,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.siteId, siteId));
  return rows.filter((r) => r.userId !== exceptUserId && r.isActive && (r.role === 'admin' || r.isSuperadmin))
    .length;
}

export async function changeMemberRole(ctx: AdminContext, userId: string, role: MemberRole): Promise<void> {
  assertCan(ctx, 'user:manage');
  const member = await getMember(ctx, userId);
  if (member.role === role) return;
  if (userId === ctx.user.id && role !== 'admin' && !ctx.user.isSuperadmin) {
    throw new ForbiddenError(t('users.error.selfDemote'));
  }
  if (member.role === 'admin' && role !== 'admin' && (await otherAdminCount(ctx.site.id, userId)) === 0) {
    throw new ConflictError(t('users.error.lastAdmin'));
  }
  await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
  await auditFromContext(ctx, {
    action: 'user.role_changed',
    entityType: 'user',
    entityId: userId,
    summary: `Endret rolle for ${member.user.email}: ${roleLabel(member.role)} → ${roleLabel(role)}`,
    data: { from: member.role, to: role },
  });
}

export async function setUserActive(ctx: AdminContext, userId: string, isActive: boolean): Promise<void> {
  assertCan(ctx, 'user:manage');
  const member = await getMember(ctx, userId);
  if (userId === ctx.user.id) throw new ForbiddenError(t('users.error.selfDeactivate'));
  if (member.user.isSuperadmin && !ctx.user.isSuperadmin)
    throw new ForbiddenError(t('users.error.superadminOnly'));
  if (member.user.isActive === isActive) return;
  if (
    !isActive &&
    (member.role === 'admin' || member.user.isSuperadmin) &&
    (await otherAdminCount(ctx.site.id, userId)) === 0
  ) {
    throw new ConflictError(t('users.error.lastAdmin'));
  }
  await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId));
  if (!isActive) await deleteUserSessions(userId);
  await auditFromContext(ctx, {
    action: isActive ? 'user.reactivated' : 'user.deactivated',
    entityType: 'user',
    entityId: userId,
    summary: `${isActive ? 'Reaktiverte' : 'Deaktiverte'} ${member.user.email}`,
  });
}

export async function removeMember(ctx: AdminContext, userId: string): Promise<void> {
  assertCan(ctx, 'user:manage');
  const member = await getMember(ctx, userId);
  if (userId === ctx.user.id) throw new ForbiddenError(t('users.error.selfRemove'));
  if (
    member.role === 'admin' &&
    !member.user.isSuperadmin &&
    (await otherAdminCount(ctx.site.id, userId)) === 0
  ) {
    throw new ConflictError(t('users.error.lastAdmin'));
  }
  await db
    .delete(memberships)
    .where(and(eq(memberships.siteId, ctx.site.id), eq(memberships.userId, userId)));
  await auditFromContext(ctx, {
    action: 'user.removed',
    entityType: 'user',
    entityId: userId,
    summary: `Fjernet ${member.user.email} fra ${ctx.site.name}`,
  });
}

export async function resendInvitation(ctx: AdminContext, userId: string): Promise<void> {
  assertCan(ctx, 'user:manage');
  const member = await getMember(ctx, userId);
  if (member.user.passwordHash) throw new ConflictError(t('users.error.notPending'));
  await sendInvitation({ user: ctx.user, site: ctx.site, ip: ctx.ip }, member.user, member.role);
  await auditFromContext(ctx, {
    action: 'user.invite_resent',
    entityType: 'user',
    entityId: userId,
    summary: `Sendte invitasjonen til ${member.user.email} på nytt`,
  });
}

export async function setSuperadmin(ctx: AdminContext, userId: string, isSuperadmin: boolean): Promise<void> {
  if (!ctx.user.isSuperadmin) throw new ForbiddenError(t('users.error.superadminOnly'));
  const member = await getMember(ctx, userId);
  if (userId === ctx.user.id && !isSuperadmin) throw new ForbiddenError(t('users.error.selfDemote'));
  if (member.user.isSuperadmin === isSuperadmin) return;
  await db.update(users).set({ isSuperadmin, updatedAt: new Date() }).where(eq(users.id, userId));
  await auditFromContext(ctx, {
    action: isSuperadmin ? 'user.superadmin_granted' : 'user.superadmin_revoked',
    entityType: 'user',
    entityId: userId,
    summary: `${isSuperadmin ? 'Ga' : 'Fjernet'} superadmin for ${member.user.email}`,
  });
}
