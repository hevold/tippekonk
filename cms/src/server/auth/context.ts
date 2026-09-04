/**
 * AdminContext — who is signed in, which site they are working on and what
 * they may do. Every admin page and action starts with
 * `const ctx = await getAdminContext()`.
 *
 * Resolution order:
 *  1. session cookie → user (redirect to /admin/login?next=… when missing)
 *  2. TOTP enabled but not verified for this session → /admin/2fa
 *  3. memberships (superadmins may use every active site) → active site from
 *     the `desken_site` cookie, else the first site by name
 *     (redirect to /admin/ingen-tilgang when the user has no site at all)
 *
 * `resolveActiveSite()` is pure and unit-tested; the rest is a thin adapter
 * over Next.js request APIs.
 */
import 'server-only';

import { eq, inArray } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { db } from '@/db';
import { memberships, sites, type MemberRole, type Site, type User } from '@/db/schema';
import { env } from '@/env';
import { isLocale, type Locale } from '@/lib/i18n';
import { can, type Permission } from '@/lib/permissions';
import { parseSiteSettings, type SiteSettings } from '@/lib/validation/site';

import { safeNextPath, SITE_COOKIE } from './cookies';
import { getSession } from './session';

export type AdminContext = {
  user: User;
  /** Active site. */
  site: Site;
  /** parseSiteSettings(site.settings) */
  settings: SiteSettings;
  /** Effective role (superadmin → 'admin'). */
  role: MemberRole;
  /** Sites the user can switch to. */
  sites: Site[];
  locale: Locale;
  can: (permission: Permission) => boolean;
  ip: string | null;
  /** Id of the current session row (for "log out everywhere except here"). */
  sessionId: string;
};

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

export type MembershipLike = { siteId: string; role: MemberRole };

export type ActiveSiteResolution = { site: Site; role: MemberRole; sites: Site[] };

/**
 * Pick the active site for a user.
 *  - superadmins: every active site, role 'admin'
 *  - members: the active sites they belong to, with their membership role
 *  - preference: `preferredSiteId` (cookie) when allowed, else first by name
 * Returns null when the user has no site to work on.
 */
export function resolveActiveSite(input: {
  isSuperadmin: boolean;
  memberships: MembershipLike[];
  allSites: Site[];
  preferredSiteId?: string | null;
}): ActiveSiteResolution | null {
  const active = input.allSites.filter((s) => s.isActive);
  const byName = (a: Site, b: Site) => a.name.localeCompare(b.name, 'nb');
  const roleFor = new Map(input.memberships.map((m) => [m.siteId, m.role] as const));

  const allowed = (input.isSuperadmin ? active : active.filter((s) => roleFor.has(s.id))).sort(byName);
  if (allowed.length === 0) return null;

  const preferred = input.preferredSiteId ? allowed.find((s) => s.id === input.preferredSiteId) : undefined;
  const site = preferred ?? allowed[0]!;
  const role: MemberRole = input.isSuperadmin ? 'admin' : (roleFor.get(site.id) ?? 'viewer');
  return { site, role, sites: allowed };
}

/** First address in X-Forwarded-For, only when the deployment says the proxy is trusted. */
export function clientIpFromHeaders(
  get: (name: string) => string | null,
  trustProxy: boolean,
): string | null {
  if (!trustProxy) return null;
  const forwarded = get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = get('x-real-ip');
  return real ? real.trim().slice(0, 64) : null;
}

function userLocale(user: Pick<User, 'locale'>): Locale {
  return isLocale(user.locale) ? user.locale : 'nb';
}

/* -------------------------------------------------------------------------- */
/*  Request-bound resolution                                                   */
/* -------------------------------------------------------------------------- */

export type AdminState =
  | { kind: 'anonymous' }
  | { kind: 'mfa_required'; user: User }
  | { kind: 'no_membership'; user: User }
  | { kind: 'ok'; ctx: AdminContext };

/** Resolve the full admin state once per request (React cache). */
export const resolveAdminState = cache(async (): Promise<AdminState> => {
  const current = await getSession();
  if (!current) return { kind: 'anonymous' };
  const { user, session } = current;
  if (user.totpEnabled && !session.mfaVerified) return { kind: 'mfa_required', user };

  const userMemberships = await db
    .select({ siteId: memberships.siteId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id));

  let candidateSites: Site[];
  if (user.isSuperadmin) {
    candidateSites = await db.select().from(sites).where(eq(sites.isActive, true));
  } else if (userMemberships.length > 0) {
    candidateSites = await db
      .select()
      .from(sites)
      .where(
        inArray(
          sites.id,
          userMemberships.map((m) => m.siteId),
        ),
      );
  } else {
    candidateSites = [];
  }

  const jar = await cookies();
  const resolution = resolveActiveSite({
    isSuperadmin: user.isSuperadmin,
    memberships: userMemberships,
    allSites: candidateSites,
    preferredSiteId: jar.get(SITE_COOKIE)?.value ?? null,
  });
  if (!resolution) return { kind: 'no_membership', user };

  const h = await headers();
  const ip = clientIpFromHeaders((name) => h.get(name), env.TRUST_PROXY);
  const role = resolution.role;
  const ctx: AdminContext = {
    user,
    site: resolution.site,
    settings: parseSiteSettings(resolution.site.settings),
    role,
    sites: resolution.sites,
    locale: userLocale(user),
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip,
    sessionId: session.id,
  };
  return { kind: 'ok', ctx };
});

async function currentPathname(): Promise<string> {
  const h = await headers();
  return h.get('x-pathname') ?? '/admin';
}

/**
 * The admin context, or a redirect: to login when unauthenticated, to the
 * 2FA screen when the second factor is pending, to "ingen tilgang" when the
 * user has no site.
 */
export async function getAdminContext(): Promise<AdminContext> {
  const state = await resolveAdminState();
  if (state.kind === 'ok') return state.ctx;
  if (state.kind === 'no_membership') redirect('/admin/ingen-tilgang');
  const next = safeNextPath(await currentPathname());
  const target = state.kind === 'anonymous' ? '/admin/login' : '/admin/2fa';
  redirect(`${target}?next=${encodeURIComponent(next)}`);
}

/** Like getAdminContext() but returns null instead of redirecting. */
export async function getOptionalAdminContext(): Promise<AdminContext | null> {
  const state = await resolveAdminState();
  return state.kind === 'ok' ? state.ctx : null;
}
