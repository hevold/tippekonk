/**
 * Profile service (/admin/profil): name/e-mail/locale, password change,
 * two-factor setup and the user's own sessions. All functions act on
 * `ctx.user` only.
 */
import { and, eq, ne } from 'drizzle-orm';
import { toDataURL } from 'qrcode';

import { db } from '@/db';
import { authors, users, type Session, type User } from '@/db/schema';
import { t } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { ActionError, ConflictError } from '@/server/actions';
import { auditFromContext } from '@/server/audit';

import type { AdminContext } from './context';
import { hashPassword, verifyPassword } from './password';
import { deleteSessionById, deleteUserSessions, listUserSessions, markSessionMfaVerified } from './session';
import { createTotpSetup, decodeTotpPayload, verifyTotpCode } from './totp';

export type ProfileInput = { name: string; email: string; locale: Locale };

export async function updateProfile(ctx: AdminContext, input: ProfileInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (email !== ctx.user.email) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, ctx.user.id)))
      .limit(1);
    if (taken[0]) throw new ConflictError(t('users.profile.error.emailTaken'));
  }
  const now = new Date();
  const [updated] = await db
    .update(users)
    .set({ name: input.name.trim(), email, locale: input.locale, updatedAt: now })
    .where(eq(users.id, ctx.user.id))
    .returning();
  if (!updated) throw new ActionError(t('common.error.generic'));
  await db.update(authors).set({ name: updated.name, updatedAt: now }).where(eq(authors.userId, updated.id));
  await auditFromContext(ctx, {
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: ctx.user.id,
    summary: `${updated.name} oppdaterte profilen sin`,
    data: {
      name: updated.name !== ctx.user.name ? { from: ctx.user.name, to: updated.name } : undefined,
      email: updated.email !== ctx.user.email ? { from: ctx.user.email, to: updated.email } : undefined,
      locale: updated.locale !== ctx.user.locale ? { from: ctx.user.locale, to: updated.locale } : undefined,
    },
  });
  return updated;
}

export async function changePassword(
  ctx: AdminContext,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const ok = ctx.user.passwordHash ? await verifyPassword(ctx.user.passwordHash, currentPassword) : false;
  if (!ok)
    throw new ActionError(t('users.profile.error.wrongPassword'), 'validation', {
      currentPassword: [t('users.profile.error.wrongPassword')],
    });
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
  // Other devices must sign in again with the new password.
  await deleteUserSessions(ctx.user.id, ctx.sessionId);
  await auditFromContext(ctx, { action: 'user.password_changed', entityType: 'user', entityId: ctx.user.id });
}

/* -------------------------------------------------------------------------- */
/*  Two-factor                                                                 */
/* -------------------------------------------------------------------------- */

export type TotpSetupView = {
  otpauthUrl: string;
  secret: string;
  qrDataUrl: string;
  recoveryCodes: string[];
};

/** Generate a new secret + recovery codes and store them (still disabled until confirmed). */
export async function beginTotpSetup(ctx: AdminContext): Promise<TotpSetupView> {
  if (ctx.user.totpEnabled) throw new ConflictError(t('users.profile.error.totpAlreadyEnabled'));
  const setup = createTotpSetup(ctx.user.email);
  await db
    .update(users)
    .set({ totpSecret: setup.encrypted, updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id));
  const qrDataUrl = await toDataURL(setup.otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
  return {
    otpauthUrl: setup.otpauthUrl,
    secret: setup.secret,
    qrDataUrl,
    recoveryCodes: setup.recoveryCodes,
  };
}

/** Confirm the pending secret with a code from the authenticator app; enables 2FA. */
export async function confirmTotpSetup(ctx: AdminContext, code: string): Promise<void> {
  const [fresh] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
  const payload = decodeTotpPayload(fresh?.totpSecret);
  if (!fresh || fresh.totpEnabled || !payload)
    throw new ConflictError(t('users.profile.error.totpNotStarted'));
  if (!verifyTotpCode(payload.secret, code)) {
    throw new ActionError(t('users.profile.error.totpCodeInvalid'), 'validation', {
      code: [t('users.profile.error.totpCodeInvalid')],
    });
  }
  await db.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, ctx.user.id));
  await markSessionMfaVerified(ctx.sessionId);
  // Other sessions have not proven the second factor; make them do so.
  await deleteUserSessions(ctx.user.id, ctx.sessionId);
  await auditFromContext(ctx, { action: 'user.totp_enabled', entityType: 'user', entityId: ctx.user.id });
}

export async function disableTotp(ctx: AdminContext, currentPassword: string): Promise<void> {
  const ok = ctx.user.passwordHash ? await verifyPassword(ctx.user.passwordHash, currentPassword) : false;
  if (!ok)
    throw new ActionError(t('users.profile.error.wrongPassword'), 'validation', {
      currentPassword: [t('users.profile.error.wrongPassword')],
    });
  await db
    .update(users)
    .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
    .where(eq(users.id, ctx.user.id));
  await auditFromContext(ctx, { action: 'user.totp_disabled', entityType: 'user', entityId: ctx.user.id });
}

/** How many recovery codes are left (null when 2FA is off). */
export function remainingRecoveryCodes(user: Pick<User, 'totpEnabled' | 'totpSecret'>): number | null {
  if (!user.totpEnabled) return null;
  return decodeTotpPayload(user.totpSecret)?.recovery.length ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export type SessionView = {
  id: string;
  current: boolean;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export async function listOwnSessions(ctx: AdminContext): Promise<SessionView[]> {
  const rows = await listUserSessions(ctx.user.id);
  return rows.map((s: Session) => ({
    id: s.id,
    current: s.id === ctx.sessionId,
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
    expiresAt: s.expiresAt,
  }));
}

export async function revokeOwnSession(ctx: AdminContext, sessionId: string): Promise<void> {
  if (sessionId === ctx.sessionId) throw new ConflictError(t('users.profile.error.currentSession'));
  await deleteSessionById(ctx.user.id, sessionId);
  await auditFromContext(ctx, { action: 'user.session_revoked', entityType: 'user', entityId: ctx.user.id });
}

/** "Logg ut overalt": every other session is removed, the current one stays. */
export async function logoutEverywhere(ctx: AdminContext): Promise<number> {
  const removed = await deleteUserSessions(ctx.user.id, ctx.sessionId);
  await auditFromContext(ctx, {
    action: 'user.logout_everywhere',
    entityType: 'user',
    entityId: ctx.user.id,
    summary: `Logget ut ${removed} andre økter`,
  });
  return removed;
}

/** Short human label for a user agent string ("Chrome · macOS"). */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return t('common.unknown');
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua)
      ? 'macOS'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Android/.test(ua)
          ? 'Android'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  const parts = [browser, os].filter((p): p is string => p !== null);
  return parts.length ? parts.join(' · ') : ua.slice(0, 40);
}
