'use client';
/**
 * AuditLogClient — filter bar (URL-driven) and table for /admin/logg with
 * expandable JSON details and a link to the entity when resolvable.
 */
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';

import { FilterBar } from '@/components/admin/filter-bar';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { buttonVariants, iconButtonSize } from '@/components/ui/button-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, formatRelative } from '@/components/ui/format';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type AuditRowDto = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  link: string | null;
  tone: 'danger' | 'success' | 'warning' | 'default';
  data: Record<string, unknown> | null;
  ip: string | null;
  siteId: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

export type AuditLogClientProps = {
  rows: AuditRowDto[];
  total: number;
  page: number;
  perPage: number;
  filters: { userId: string; action: string; entityType: string; from: string; to: string; q: string };
  users: { id: string; name: string }[];
  actionPrefixes: string[];
  entityTypes: string[];
  /** True when nothing is logged at all (vs. no match for the filters). */
  logEmpty: boolean;
};

const TONE_VARIANT = { danger: 'danger', success: 'success', warning: 'warning', default: 'muted' } as const;

export function AuditLogClient({
  rows,
  total,
  page,
  perPage,
  filters,
  users,
  actionPrefixes,
  entityTypes,
  logEmpty,
}: AuditLogClientProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function navigate(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const activeCount = Object.values(filters).filter(Boolean).length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const hrefFor = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(n));
    return `${pathname}?${params.toString()}`;
  };

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const prefixLabel = (prefix: string) => {
    const key = `audit.prefix.${prefix}`;
    const label = t(key);
    return label === key ? prefix : label;
  };

  return (
    <div className="grid gap-4">
      <FilterBar
        search={{
          value: filters.q,
          onChange: (v) => navigate({ q: v || undefined }),
          placeholder: t('audit.searchPlaceholder'),
        }}
        activeCount={activeCount}
        onReset={() => router.push(pathname)}
        end={<span className="text-muted text-sm">{t('audit.count', { count: total })}</span>}
      >
        <NativeSelect
          size="sm"
          aria-label={t('audit.user')}
          value={filters.userId}
          onChange={(e) => navigate({ user: e.target.value || undefined })}
          options={[
            { value: '', label: t('audit.allUsers') },
            ...users.map((u) => ({ value: u.id, label: u.name })),
          ]}
          className="w-auto"
        />
        <NativeSelect
          size="sm"
          aria-label={t('audit.action')}
          value={filters.action}
          onChange={(e) => navigate({ action: e.target.value || undefined })}
          options={[
            { value: '', label: t('audit.allActions') },
            ...actionPrefixes.map((p) => ({ value: p, label: prefixLabel(p) })),
          ]}
          className="w-auto"
        />
        <NativeSelect
          size="sm"
          aria-label={t('audit.entityType')}
          value={filters.entityType}
          onChange={(e) => navigate({ type: e.target.value || undefined })}
          options={[
            { value: '', label: t('audit.allTypes') },
            ...entityTypes.map((p) => ({ value: p, label: prefixLabel(p) })),
          ]}
          className="w-auto"
        />
        <Input
          size="sm"
          type="date"
          aria-label={t('audit.from')}
          value={filters.from}
          onChange={(e) => navigate({ from: e.target.value || undefined })}
          className="w-auto"
        />
        <Input
          size="sm"
          type="date"
          aria-label={t('audit.to')}
          value={filters.to}
          onChange={(e) => navigate({ to: e.target.value || undefined })}
          className="w-auto"
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title={logEmpty ? t('audit.emptyAll') : t('audit.empty')} />
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <span className="sr-only">{t('audit.details')}</span>
                </TableHead>
                <TableHead className="w-44">{t('audit.time')}</TableHead>
                <TableHead className="w-40">{t('audit.user')}</TableHead>
                <TableHead>{t('audit.summary')}</TableHead>
                <TableHead className="w-36">{t('audit.action')}</TableHead>
                <TableHead className="w-16 text-right">
                  <span className="sr-only">{t('audit.open')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const open = expanded.has(row.id);
                const detailsId = `audit-${row.id}`;
                return (
                  <Fragment key={row.id}>
                    <TableRow className={cn(open && 'bg-surface-2/50')}>
                      <TableCell className="align-top">
                        <IconButton
                          size="sm"
                          label={open ? t('audit.hideDetails') : t('audit.showDetails')}
                          noTooltip
                          aria-expanded={open}
                          aria-controls={detailsId}
                          onClick={() => toggle(row.id)}
                        >
                          {open ? <ChevronDown /> : <ChevronRight />}
                        </IconButton>
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        <Tooltip content={formatDateTime(row.createdAt)}>
                          <time dateTime={row.createdAt} className="text-muted text-[13px]">
                            {formatRelative(row.createdAt)}
                          </time>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="align-top">
                        {row.user ? (
                          <span className="grid">
                            <span className="truncate text-sm font-medium">{row.user.name}</span>
                            <span className="text-muted truncate text-[12px]">{row.user.email}</span>
                          </span>
                        ) : (
                          <span className="text-muted text-sm">{t('audit.system')}</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <span className="text-sm">{row.summary}</span>
                        {row.siteId === null ? (
                          <Badge variant="outline" className="ml-2">
                            {t('audit.global')}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={TONE_VARIANT[row.tone]} className="font-mono text-[11px]">
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {row.link ? (
                          <Tooltip content={t('audit.open')}>
                            <Link
                              href={row.link}
                              aria-label={t('audit.open')}
                              className={cn(
                                buttonVariants({ variant: 'ghost', size: 'sm' }),
                                iconButtonSize.sm,
                              )}
                            >
                              <ExternalLink />
                            </Link>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow id={detailsId}>
                        <TableCell colSpan={6} className="bg-surface-2/50">
                          <dl className="text-muted mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
                            <div>
                              <dt className="inline font-medium">{t('audit.time')}: </dt>
                              <dd className="inline">{formatDateTime(row.createdAt)}</dd>
                            </div>
                            {row.entityType ? (
                              <div>
                                <dt className="inline font-medium">{t('audit.entity')}: </dt>
                                <dd className="inline font-mono">
                                  {row.entityType}
                                  {row.entityId ? ` ${row.entityId}` : ''}
                                </dd>
                              </div>
                            ) : null}
                            {row.ip ? (
                              <div>
                                <dt className="inline font-medium">{t('audit.ip')}: </dt>
                                <dd className="inline font-mono">{row.ip}</dd>
                              </div>
                            ) : null}
                          </dl>
                          {row.data ? (
                            <pre className="bg-surface border-border max-h-80 overflow-auto rounded-md border p-3 font-mono text-[12px] leading-5">
                              {JSON.stringify(row.data, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-muted text-[13px]">{t('audit.noData')}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </div>
  );
}
