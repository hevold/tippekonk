/**
 * /admin/logout — destroys the session and redirects to the login page.
 * POST is the proper way (forms/menus); GET works as a fallback for plain
 * links such as the user menu and the "ingen tilgang" page.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { audit } from '@/server/audit';
import { clientIpFromHeaders } from '@/server/auth/context';
import { destroySession, getSession } from '@/server/auth/session';
import { env } from '@/env';

async function logout(request: NextRequest): Promise<NextResponse> {
  const current = await getSession();
  if (current) {
    const ip = clientIpFromHeaders((name) => request.headers.get(name), env.TRUST_PROXY);
    await audit(
      { user: current.user, ip },
      { action: 'auth.logout', entityType: 'user', entityId: current.user.id },
    );
  }
  await destroySession();
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return logout(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return logout(request);
}
