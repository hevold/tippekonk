'use server';
/**
 * Server actions for the auth area: login, second factor, password
 * recovery, invitation acceptance, site switching, users admin and profile.
 * Business logic lives in the sibling service modules; this file validates
 * input, resolves the request context and maps errors to form/action state.
 */
import { refresh } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z, ZodError } from 'zod';

import type { MemberRole } from '@/db/schema';
import { t } from '@/lib/i18n';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  inviteSchema,
  loginSchema,
  memberRoleSchema,
  profileSchema,
  resetPasswordSchema,
  totpCodeSchema,
} from '@/lib/validation/user';
import {
  ActionError,
  ForbiddenError,
  isNextControlFlowError,
  runAction,
  type ActionResult,
} from '@/server/actions';
import { audit } from '@/server/audit';
import { env } from '@/env';

import { clientIpFromHeaders } from './context';
import { safeNextPath, SITE_COOKIE, siteCookieOptions } from './cookies';
import type { FormState } from './form-state';
import { requireAdminContext, requirePermission } from './guards';
import { acceptInvite, inviteUser, requestPasswordReset, resetPassword } from './invites';
import { attemptLogin, verifySecondFactor } from './login';
import {
  beginTotpSetup,
  changePassword,
  confirmTotpSetup,
  disableTotp,
  logoutEverywhere,
  revokeOwnSession,
  updateProfile,
  type TotpSetupView,
} from './profile';
import { createSession, destroySession, getSession, markSessionMfaVerified } from './session';
import { changeMemberRole, removeMember, resendInvitation, setSuperadmin, setUserActive } from './users';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders((name) => h.get(name), env.TRUST_PROXY), userAgent: h.get('user-agent') };
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

function firstIssues(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Map thrown errors to FormState; Next.js redirects are re-thrown. */
function formFailure(err: unknown, values?: Record<string, string>): FormState {
  if (isNextControlFlowError(err)) throw err;
  if (err instanceof ZodError) {
    return { error: t('common.error.validation'), fieldErrors: firstIssues(err), values };
  }
  if (err instanceof ActionError) {
    const fieldErrors = err.fieldErrors
      ? Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? err.message]))
      : undefined;
    return { error: err.message, fieldErrors, values };
  }
  console.error('[auth]', err);
  return { error: t('common.error.generic'), values };
}

/* -------------------------------------------------------------------------- */
/*  Login, 2FA, recovery, invitation                                           */
/* -------------------------------------------------------------------------- */

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: str(formData, 'email'), next: str(formData, 'next') };
  let target = '/admin';
  try {
    const input = loginSchema.parse({
      email: values.email,
      password: str(formData, 'password'),
      remember: str(formData, 'remember'),
      next: values.next,
    });
    const meta = await requestMeta();
    const result = await attemptLogin({ email: input.email, password: input.password, ...meta });
    if (!result.ok) {
      if (result.reason === 'rate_limited') {
        return {
          error: t('auth.login.rateLimited', { minutes: Math.max(1, Math.ceil(result.retryAfterSec / 60)) }),
          values,
        };
      }
      if (result.reason === 'inactive') return { error: t('auth.login.inactive'), values };
      return { error: t('auth.login.invalid'), values };
    }
    await createSession(result.user.id, { mfaVerified: !result.mfaRequired, ...meta });
    const next = safeNextPath(input.next);
    target = result.mfaRequired ? `/admin/2fa?next=${encodeURIComponent(next)}` : next;
  } catch (err) {
    return formFailure(err, values);
  }
  redirect(target);
}

export async function verifyTotpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const next = safeNextPath(str(formData, 'next'));
  try {
    const current = await getSession();
    if (!current) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
    if (current.session.mfaVerified || !current.user.totpEnabled) redirect(next);
    const code = z
      .string()
      .trim()
      .min(1, t('auth.twoFactor.codeRequired'))
      .max(20)
      .parse(str(formData, 'code'));
    const meta = await requestMeta();
    const result = await verifySecondFactor(current.user, code, meta.ip);
    if (!result.ok) {
      if (result.reason === 'rate_limited') {
        return {
          error: t('auth.login.rateLimited', { minutes: Math.max(1, Math.ceil(result.retryAfterSec / 60)) }),
        };
      }
      if (result.reason === 'not_enabled') redirect(next);
      return { error: t('auth.twoFactor.invalid') };
    }
    await markSessionMfaVerified(current.session.id);
  } catch (err) {
    return formFailure(err);
  }
  redirect(next);
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: str(formData, 'email') };
  try {
    const input = forgotPasswordSchema.parse(values);
    const meta = await requestMeta();
    const outcome = await requestPasswordReset(input.email, meta.ip);
    if (outcome === 'rate_limited') return { error: t('auth.forgot.rateLimited'), values };
    // Always the same message, whether or not the address exists.
    return { success: true, values };
  } catch (err) {
    return formFailure(err, values);
  }
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = resetPasswordSchema.parse({
      token: str(formData, 'token'),
      password: str(formData, 'password'),
      passwordConfirm: str(formData, 'passwordConfirm'),
    });
    const meta = await requestMeta();
    await resetPassword({ token: input.token, password: input.password, ip: meta.ip });
  } catch (err) {
    return formFailure(err);
  }
  redirect('/admin/login?reset=1');
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: str(formData, 'name') };
  try {
    const input = acceptInviteSchema.parse({
      token: str(formData, 'token'),
      name: values.name,
      password: str(formData, 'password'),
      passwordConfirm: str(formData, 'passwordConfirm'),
    });
    const meta = await requestMeta();
    const user = await acceptInvite({
      token: input.token,
      name: input.name,
      password: input.password,
      ip: meta.ip,
    });
    await createSession(user.id, { mfaVerified: true, ...meta });
    const siteId = str(formData, 'siteId');
    if (z.uuid().safeParse(siteId).success) {
      const jar = await cookies();
      jar.set(SITE_COOKIE, siteId, siteCookieOptions(env.APP_URL));
    }
  } catch (err) {
    return formFailure(err, values);
  }
  redirect('/admin');
}

/** Sign out: destroy the session and go to the login page. */
export async function logoutAction(): Promise<void> {
  const current = await getSession();
  if (current) {
    const meta = await requestMeta();
    await audit(
      { user: current.user, ip: meta.ip },
      { action: 'auth.logout', entityType: 'user', entityId: current.user.id },
    );
  }
  await destroySession();
  redirect('/admin/login');
}

/** Switch the active site (cookie `desken_site`); the target must be one of ctx.sites. */
export async function switchSiteAction(input: unknown): Promise<ActionResult<{ siteId: string }>> {
  return runAction(async () => {
    const siteId = z.uuid().parse(input);
    const ctx = await requireAdminContext();
    const target = ctx.sites.find((s) => s.id === siteId);
    if (!target) throw new ForbiddenError(t('auth.error.notMemberOfSite'));
    const jar = await cookies();
    jar.set(SITE_COOKIE, target.id, siteCookieOptions(env.APP_URL));
    refresh();
    return { siteId: target.id };
  });
}

/* -------------------------------------------------------------------------- */
/*  Users admin                                                                */
/* -------------------------------------------------------------------------- */

export async function inviteUserAction(
  input: unknown,
): Promise<ActionResult<{ invited: boolean; created: boolean }>> {
  return runAction(async () => {
    const ctx = await requirePermission('user:manage');
    const data = inviteSchema.parse(input);
    const outcome = await inviteUser({ user: ctx.user, site: ctx.site, ip: ctx.ip }, data);
    refresh();
    return { invited: outcome.invited, created: outcome.created };
  });
}

const memberActionSchema = z.object({ userId: z.uuid() });

export async function changeRoleAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const data = memberActionSchema.extend({ role: memberRoleSchema }).parse(input);
    const ctx = await requirePermission('user:manage');
    await changeMemberRole(ctx, data.userId, data.role as MemberRole);
    refresh();
  });
}

export async function setUserActiveAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const data = memberActionSchema.extend({ isActive: z.boolean() }).parse(input);
    const ctx = await requirePermission('user:manage');
    await setUserActive(ctx, data.userId, data.isActive);
    refresh();
  });
}

export async function removeMemberAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const data = memberActionSchema.parse(input);
    const ctx = await requirePermission('user:manage');
    await removeMember(ctx, data.userId);
    refresh();
  });
}

export async function resendInviteAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const data = memberActionSchema.parse(input);
    const ctx = await requirePermission('user:manage');
    await resendInvitation(ctx, data.userId);
  });
}

export async function setSuperadminAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const data = memberActionSchema.extend({ isSuperadmin: z.boolean() }).parse(input);
    const ctx = await requirePermission('user:manage');
    await setSuperadmin(ctx, data.userId, data.isSuperadmin);
    refresh();
  });
}

/* -------------------------------------------------------------------------- */
/*  Profile                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: str(formData, 'name'),
    email: str(formData, 'email'),
    locale: str(formData, 'locale'),
  };
  try {
    const ctx = await requireAdminContext();
    const input = profileSchema.parse(values);
    await updateProfile(ctx, { name: input.name, email: input.email, locale: input.locale });
    refresh();
    return { success: true, values: { name: input.name, email: input.email, locale: input.locale } };
  } catch (err) {
    return formFailure(err, values);
  }
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const ctx = await requireAdminContext();
    const input = changePasswordSchema.parse({
      currentPassword: str(formData, 'currentPassword'),
      password: str(formData, 'password'),
      passwordConfirm: str(formData, 'passwordConfirm'),
    });
    await changePassword(ctx, input.currentPassword, input.password);
    return { success: true };
  } catch (err) {
    return formFailure(err);
  }
}

export async function beginTotpSetupAction(): Promise<ActionResult<TotpSetupView>> {
  return runAction(async () => {
    const ctx = await requireAdminContext();
    return beginTotpSetup(ctx);
  });
}

export async function confirmTotpAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const code = totpCodeSchema.parse(input);
    const ctx = await requireAdminContext();
    await confirmTotpSetup(ctx, code);
    refresh();
  });
}

export async function disableTotpAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const password = z.string().min(1, t('users.profile.error.wrongPassword')).parse(input);
    const ctx = await requireAdminContext();
    await disableTotp(ctx, password);
    refresh();
  });
}

export async function revokeSessionAction(input: unknown): Promise<ActionResult<void>> {
  return runAction(async () => {
    const id = z.uuid().parse(input);
    const ctx = await requireAdminContext();
    await revokeOwnSession(ctx, id);
    refresh();
  });
}

export async function logoutEverywhereAction(): Promise<ActionResult<{ removed: number }>> {
  return runAction(async () => {
    const ctx = await requireAdminContext();
    const removed = await logoutEverywhere(ctx);
    refresh();
    return { removed };
  });
}
