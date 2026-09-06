/**
 * /admin/logg — audit log viewer. Filters live in the URL
 * (?user=&action=&type=&from=&to=&q=&page=); requires audit:view.
 */
import type { Metadata } from 'next';

import { AuditLogClient, type AuditRowDto } from '@/components/settings/audit-log-client';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import {
  auditEntityLink,
  auditLogFilterSchema,
  auditTone,
  describeAuditEntry,
  listAuditFacets,
  listAuditLog,
  listAuditUsers,
} from '@/server/settings/audit-log';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Logg' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** End of the given day in Europe/Oslo-ish terms: use the next day's start (UTC is fine for a filter). */
function endOfDay(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  if (!ctx.can('audit:view')) {
    return (
      <>
        <PageHeader title={t('audit.title')} />
        <Alert variant="danger">{t('audit.forbidden')}</Alert>
      </>
    );
  }
  const sp = await searchParams;
  const raw = {
    userId: first(sp.user),
    action: first(sp.action),
    entityType: first(sp.type),
    from: first(sp.from),
    to: first(sp.to),
    q: first(sp.q),
    page: first(sp.page) || undefined,
  };
  const parsed = auditLogFilterSchema.safeParse({ ...raw, to: endOfDay(raw.to) });
  const filter = parsed.success ? parsed.data : auditLogFilterSchema.parse({});
  const includeGlobal = ctx.user.isSuperadmin;

  const [page, users, facets, anyAtAll] = await Promise.all([
    listAuditLog(ctx.site.id, filter, { includeGlobal }),
    listAuditUsers(ctx.site.id),
    listAuditFacets(ctx.site.id),
    listAuditLog(ctx.site.id, { perPage: 1 }, { includeGlobal }),
  ]);

  const rows: AuditRowDto[] = page.items.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: describeAuditEntry(e),
    link: auditEntityLink(e),
    tone: auditTone(e.action),
    data: e.data,
    ip: e.ip,
    siteId: e.siteId,
    createdAt: e.createdAt.toISOString(),
    user: e.user,
  }));

  return (
    <>
      <PageHeader title={t('audit.title')} description={t('audit.description')} />
      <AuditLogClient
        rows={rows}
        total={page.total}
        page={page.page}
        perPage={page.perPage}
        filters={{
          userId: parsed.success ? (filter.userId ?? '') : '',
          action: filter.action ?? '',
          entityType: filter.entityType ?? '',
          from: raw.from,
          to: raw.to,
          q: filter.q ?? '',
        }}
        users={users}
        actionPrefixes={facets.actionPrefixes}
        entityTypes={facets.entityTypes}
        logEmpty={anyAtAll.total === 0}
      />
    </>
  );
}
