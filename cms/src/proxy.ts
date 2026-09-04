/**
 * Proxy (Next.js 16 middleware replacement). Runs on every request except
 * static assets and is deliberately cheap:
 *
 *  - /admin/** (except the login/recovery screens): redirect to
 *    /admin/login?next=… when the session cookie is missing. This is an
 *    optimistic check only — getAdminContext() does the real verification.
 *  - sets the `x-pathname` request header so layouts know where they are
 *  - admin responses: X-Frame-Options: DENY and no caching
 *  - anonymous GET requests outside /admin and /api get a public
 *    Cache-Control so a CDN/reverse proxy can absorb traffic spikes
 */
import { NextResponse, type NextRequest } from 'next/server';

import { isAuthPublicPath, SESSION_COOKIE } from '@/server/auth/cookies';

const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=600';

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdmin) {
    if (!hasSession && !isAuthPublicPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      url.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(url);
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const isApi = pathname === '/api' || pathname.startsWith('/api/');
  if (request.method === 'GET' && !hasSession && !isApi) {
    response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
  }
  return response;
}

export const config = {
  // Everything except Next internals, served media and static files with an extension.
  matcher: [
    '/((?!_next/|media/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)',
  ],
};
