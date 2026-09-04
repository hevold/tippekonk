/**
 * Cookie names and options shared by the session layer, the server actions
 * and `src/proxy.ts`. This module is intentionally free of database and
 * `server-only` imports so the proxy can use it.
 */

export const SESSION_COOKIE = 'desken_session';
export const SITE_COOKIE = 'desken_site';

/** Session lifetime: 30 days, renewed when less than 15 days remain. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000;

export type CookieOptions = {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
};

/** Options for the session cookie. `secure` follows the canonical APP_URL scheme. */
export function sessionCookieOptions(appUrl: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** Options for the active-site cookie (one year; not secret, but httpOnly anyway). */
export function siteCookieOptions(appUrl: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl.startsWith('https://'),
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  };
}

/** Admin paths that must be reachable without a session (login and recovery flows). */
export const AUTH_PUBLIC_PREFIXES = [
  '/admin/login',
  '/admin/glemt-passord',
  '/admin/tilbakestill',
  '/admin/invitasjon',
  '/admin/2fa',
  '/admin/logout',
] as const;

export function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow local, non-protocol-relative return paths after login. */
export function safeNextPath(value: string | null | undefined, fallback = '/admin'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value.length > 500) return fallback;
  // Never bounce back into the auth screens themselves.
  if (isAuthPublicPath(value.split('?')[0] ?? value)) return fallback;
  return value;
}
