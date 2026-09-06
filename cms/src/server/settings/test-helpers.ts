/**
 * Test-only helpers for the settings area: builds an AdminContext for a
 * seeded user without touching Next.js request APIs.
 */
import type { MemberRole, Site, User } from '@/db/schema';
import { can } from '@/lib/permissions';
import { parseSiteSettings } from '@/lib/validation/site';
import type { AdminContext } from '@/server/auth/context';

export function testContext(user: User, site: Site, role: MemberRole = 'admin'): AdminContext {
  return {
    user,
    site,
    settings: parseSiteSettings(site.settings),
    role,
    sites: [site],
    locale: 'nb',
    can: (permission) => can(role, permission, user.isSuperadmin),
    ip: '127.0.0.1',
    sessionId: 'test-session',
  };
}
