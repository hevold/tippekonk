/**
 * URL helpers for the article list: the filter lives entirely in the query
 * string so views can be bookmarked and shared. Pure — used by the server
 * page (tabs, pagination links) and the client filter bar alike.
 */
import { adminPaths } from '@/config/routes';

export const LIST_QUERY_KEYS = [
  'status',
  'q',
  'sectionId',
  'contentTypeId',
  'tagId',
  'authorId',
  'assignedTo',
  'access',
  'sort',
  'page',
  'from',
  'to',
] as const;
export type ListQueryKey = (typeof LIST_QUERY_KEYS)[number];
export type ListQuery = Partial<Record<ListQueryKey, string | undefined>>;

const DEFAULTS: Partial<Record<ListQueryKey, string>> = { sort: '-updatedAt', page: '1', status: '' };

/** Build /admin/artikler?… from a query, dropping empty values and defaults. */
export function listHref(query: ListQuery, base: string = adminPaths.articles()): string {
  const params = new URLSearchParams();
  for (const key of LIST_QUERY_KEYS) {
    const value = query[key]?.trim();
    if (!value || value === DEFAULTS[key]) continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Merge a change into the query; changing anything but the page resets the page. */
export function withQuery(current: ListQuery, patch: ListQuery): ListQuery {
  const next: ListQuery = { ...current, ...patch };
  const changedFilter = Object.keys(patch).some((k) => k !== 'page');
  if (changedFilter) next.page = undefined;
  return next;
}

/** Number of user-chosen filters (everything except status tab, sort and page). */
export function activeFilterCount(query: ListQuery): number {
  return (
    ['q', 'sectionId', 'contentTypeId', 'tagId', 'authorId', 'assignedTo', 'access', 'from', 'to'] as const
  ).filter((k) => Boolean(query[k]?.trim())).length;
}
