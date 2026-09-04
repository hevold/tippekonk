/**
 * Permission model. Roles are per site membership (see memberships.role).
 * Superadmins (users.isSuperadmin) hold every permission on every site.
 *
 * Check permissions with `can(role, permission)` (pure) or, in server code,
 * `requirePermission('article:publish')` from '@/server/auth/guards'.
 */
import type { MemberRole } from '@/db/schema';

export const PERMISSIONS = [
  'admin:access', // may open /admin at all
  'article:create',
  'article:edit_own',
  'article:edit_any',
  'article:review', // request/perform review, approve
  'article:publish', // publish, unpublish, schedule
  'article:delete',
  'media:upload',
  'media:edit',
  'media:delete',
  'layout:edit',
  'layout:publish',
  'taxonomy:manage', // sections, tags, authors
  'content_type:manage',
  'live:manage',
  'user:manage',
  'settings:manage',
  'integration:manage', // API keys, webhooks
  'audit:view',
  'site:manage', // create/delete sites — superadmin only
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS].filter((p) => p !== 'site:manage');

export const ROLE_PERMISSIONS: Record<MemberRole, readonly Permission[]> = {
  admin: ALL,
  editor: [
    'admin:access',
    'article:create',
    'article:edit_own',
    'article:edit_any',
    'article:review',
    'article:publish',
    'article:delete',
    'media:upload',
    'media:edit',
    'media:delete',
    'layout:edit',
    'layout:publish',
    'taxonomy:manage',
    'content_type:manage',
    'live:manage',
    'audit:view',
  ],
  journalist: [
    'admin:access',
    'article:create',
    'article:edit_own',
    'article:edit_any',
    'article:review',
    'media:upload',
    'media:edit',
    'live:manage',
  ],
  contributor: ['admin:access', 'article:create', 'article:edit_own', 'media:upload'],
  viewer: ['admin:access'],
};

export const ROLE_ORDER: MemberRole[] = ['viewer', 'contributor', 'journalist', 'editor', 'admin'];

export function can(role: MemberRole | null | undefined, permission: Permission, isSuperadmin = false): boolean {
  if (isSuperadmin) return true;
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}
