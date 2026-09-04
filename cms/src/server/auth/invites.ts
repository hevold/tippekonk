/**
 * Invitations and password recovery — pure services used by the users admin
 * and the (auth) pages.
 *
 * Invite: admin enters e-mail + role → user row (no password yet) +
 * membership + 72 h token + e-mail with /admin/invitasjon/<token>. If the
 * e-mail already belongs to a user, only a membership is added and an
 * "access granted" e-mail is sent. Accepting sets name + password and
 * activates the account.
 *
 * Reset: /admin/glemt-passord always reports success (no user enumeration);
 * an e-mail with /admin/tilbakestill/<token> (60 min) goes out when the
 * address exists. Resetting the password logs the user out everywhere.
 */
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { authors, memberships, sites, users, type MemberRole, type Site, type User } from '@/db/schema';
import { env } from '@/env';
import { t } from '@/lib/i18n';
import { slugify, uniqueSlug } from '@/lib/text/slug';
import { ActionError, ConflictError, NotFoundError } from '@/server/actions';
import { audit } from '@/server/audit';
import { accessGrantedEmail, inviteEmail, passwordResetEmail, sendMail } from '@/server/email';
import { rateLimit } from '@/server/rate-limit';

import { hashPassword } from './password';
import { deleteUserSessions } from './session';
import { consumeToken, createToken, invalidateTokens, peekToken } from './tokens';

export const INVITE_TTL_MINUTES = 72 * 60;
export const RESET_TTL_MINUTES = 60;
export const FORGOT_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 } as const;

type Actor = { user: User; site: Site; ip: string | null };

export function absoluteUrl(path: string): string {
  return new URL(path, env.APP_URL).toString();
}

export function roleLabel(role: MemberRole): string {
  return t(`common.role.${role}`);
}

/* -------------------------------------------------------------------------- */
/*  Invitations                                                                */
/* -------------------------------------------------------------------------- */

export type InviteUserInput = { email: string; name: string; role: MemberRole; createAuthor: boolean };

export type InviteOutcome = { user: User; created: boolean; invited: boolean };

async function ensureAuthor(siteId: string, user: User): Promise<void> {
  const existing = await db
    .select({ id: authors.id })
    .from(authors)
    .where(and(eq(authors.siteId, siteId), eq(authors.userId, user.id)))
    .limit(1);
  if (existing[0]) return;
  const base = slugify(user.name) || slugify(user.email.split('@')[0] ?? 'skribent') || 'skribent';
  const slug = await uniqueSlug(base, async (candidate) => {
    const rows = await db
      .select({ id: authors.id })
      .from(authors)
      .where(and(eq(authors.siteId, siteId), eq(authors.slug, candidate)))
      .limit(1);
    return rows.length > 0;
  });
  await db.insert(authors).values({ siteId, userId: user.id, name: user.name, slug, email: user.email });
}

/** Send (or re-send) the invitation e-mail for a user who has not set a password yet. */
export async function sendInvitation(actor: Actor, user: User, role: MemberRole): Promise<void> {
  await invalidateTokens('invite', user.id);
  const raw = await createToken('invite', {
    userId: user.id,
    siteId: actor.site.id,
    ttlMinutes: INVITE_TTL_MINUTES,
    meta: { role },
  });
  const mail = inviteEmail({
    name: user.name,
    siteName: actor.site.name,
    inviterName: actor.user.name,
    roleLabel: roleLabel(role),
    link: absoluteUrl(`/admin/invitasjon/${raw}`),
    expiresHours: INVITE_TTL_MINUTES / 60,
  });
  await sendMail(user.email, mail.subject, mail.html, mail.text);
}

export async function inviteUser(actor: Actor, input: InviteUserInput): Promise<InviteOutcome> {
  const email = input.email.trim().toLowerCase();
  const existingRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existingRows[0] ?? null;
  let created = false;

  if (user) {
    const member = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.siteId, actor.site.id)))
      .limit(1);
    if (member[0]) throw new ConflictError(t('users.error.alreadyMember'));
  } else {
    const inserted = await db
      .insert(users)
      .values({ email, name: input.name.trim(), passwordHash: null, isActive: true })
      .returning();
    user = inserted[0] ?? null;
    if (!user) throw new ActionError(t('users.error.createFailed'));
    created = true;
  }

  await db.insert(memberships).values({ userId: user.id, siteId: actor.site.id, role: input.role });
  if (input.createAuthor) await ensureAuthor(actor.site.id, user);

  const pending = !user.passwordHash;
  if (pending) {
    await sendInvitation(actor, user, input.role);
  } else {
    const mail = accessGrantedEmail({
      name: user.name,
      siteName: actor.site.name,
      inviterName: actor.user.name,
      roleLabel: roleLabel(input.role),
      link: absoluteUrl('/admin/login'),
    });
    await sendMail(user.email, mail.subject, mail.html, mail.text);
  }

  await audit(actor, {
    action: 'user.invite',
    entityType: 'user',
    entityId: user.id,
    summary: `Inviterte ${user.email} som ${roleLabel(input.role).toLowerCase()}`,
    data: { role: input.role, created, createAuthor: input.createAuthor },
  });
  return { user, created, invited: pending };
}

export type InvitePreview = { user: User; site: Site | null; role: MemberRole | null };

/** Details for the accept page (does not consume the token). */
export async function previewInvite(raw: string): Promise<InvitePreview | null> {
  const token = await peekToken('invite', raw);
  if (!token || !token.userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, token.userId)).limit(1);
  if (!user || user.passwordHash) return null;
  const site = token.siteId
    ? ((await db.select().from(sites).where(eq(sites.id, token.siteId)).limit(1))[0] ?? null)
    : null;
  const role = typeof token.meta.role === 'string' ? (token.meta.role as MemberRole) : null;
  return { user, site, role };
}

export type AcceptInviteInput = { token: string; name: string; password: string; ip: string | null };

/** Consume the invite token, set name + password and activate the account. */
export async function acceptInvite(input: AcceptInviteInput): Promise<User> {
  const token = await consumeToken('invite', input.token);
  if (!token || !token.userId) throw new NotFoundError(t('auth.invite.invalid'));
  const [user] = await db.select().from(users).where(eq(users.id, token.userId)).limit(1);
  if (!user) throw new NotFoundError(t('auth.invite.invalid'));
  if (user.passwordHash) throw new ConflictError(t('auth.invite.alreadyAccepted'));

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const [updated] = await db
    .update(users)
    .set({
      name: input.name.trim(),
      passwordHash,
      isActive: true,
      emailVerifiedAt: now,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id))
    .returning();
  if (!updated) throw new ActionError(t('common.error.generic'));
  // Keep the author byline in sync with the name the user chose.
  await db.update(authors).set({ name: updated.name, updatedAt: now }).where(eq(authors.userId, updated.id));

  await audit(
    { user: updated, site: token.siteId ? { id: token.siteId } : null, ip: input.ip },
    {
      action: 'user.invite_accepted',
      entityType: 'user',
      entityId: updated.id,
      summary: `${updated.name} godtok invitasjonen`,
    },
  );
  return updated;
}

/* -------------------------------------------------------------------------- */
/*  Password reset                                                             */
/* -------------------------------------------------------------------------- */

export type ForgotPasswordOutcome = 'sent' | 'unknown' | 'rate_limited';

/**
 * Start a password reset. Returns what happened for logging, but the UI
 * shows the same success message regardless.
 */
export async function requestPasswordReset(email: string, ip: string | null): Promise<ForgotPasswordOutcome> {
  const normalized = email.trim().toLowerCase();
  const limit = rateLimit(`forgot:${ip ?? 'local'}:${normalized}`, FORGOT_RATE_LIMIT);
  if (!limit.ok) return 'rate_limited';

  const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  if (!user || !user.isActive) return 'unknown';

  const memberSite = await db
    .select({ site: sites })
    .from(memberships)
    .innerJoin(sites, eq(memberships.siteId, sites.id))
    .where(eq(memberships.userId, user.id))
    .limit(1);
  const siteName = memberSite[0]?.site.name ?? 'Desken';

  await invalidateTokens('password_reset', user.id);
  const raw = await createToken('password_reset', { userId: user.id, ttlMinutes: RESET_TTL_MINUTES });
  const mail = passwordResetEmail({
    name: user.name,
    siteName,
    link: absoluteUrl(`/admin/tilbakestill/${raw}`),
    expiresMinutes: RESET_TTL_MINUTES,
  });
  await sendMail(user.email, mail.subject, mail.html, mail.text);
  await audit(
    { user, ip },
    { action: 'auth.password_reset_requested', entityType: 'user', entityId: user.id },
  );
  return 'sent';
}

/** True when the reset token is still usable (for rendering the form). */
export async function isResetTokenValid(raw: string): Promise<boolean> {
  return (await peekToken('password_reset', raw)) !== null;
}

/** Consume the token, set the new password and log the user out everywhere. */
export async function resetPassword(input: {
  token: string;
  password: string;
  ip: string | null;
}): Promise<User> {
  const token = await consumeToken('password_reset', input.token);
  if (!token || !token.userId) throw new NotFoundError(t('auth.reset.invalid'));
  const [user] = await db.select().from(users).where(eq(users.id, token.userId)).limit(1);
  if (!user || !user.isActive) throw new NotFoundError(t('auth.reset.invalid'));

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const [updated] = await db
    .update(users)
    .set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now, updatedAt: now })
    .where(eq(users.id, user.id))
    .returning();
  if (!updated) throw new ActionError(t('common.error.generic'));
  await deleteUserSessions(user.id);
  await audit(
    { user: updated, ip: input.ip },
    { action: 'auth.password_reset', entityType: 'user', entityId: updated.id },
  );
  return updated;
}
