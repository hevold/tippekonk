'use client';
/**
 * /admin/forside list: the front page plus one entry per section. Sections
 * without a layout row yet show "Opprett" (creates the default draft on
 * demand and opens the editor).
 */
import { LayoutTemplate, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { formatRelative } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { createLayoutAction } from '@/server/layouts/actions';

export type LayoutListRow = {
  key: string;
  name: string;
  exists: boolean;
  hasDraftChanges: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  sectionSlug: string | null;
  rowCount: number;
};

export function LayoutList({ rows, canEdit }: { rows: LayoutListRow[]; canEdit: boolean }) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);

  async function create(key: string) {
    setCreating(key);
    try {
      const res = await createLayoutAction({ key });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.push(adminPaths.layout(key));
    } finally {
      setCreating(null);
    }
  }

  const columns: ColumnDef<LayoutListRow>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <LayoutTemplate className="text-muted size-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="text-muted text-xs">
              {row.key === 'front' ? '/' : `/${row.sectionSlug ?? ''}`}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (row) =>
        !row.exists ? (
          <Badge variant="muted">{t('layout.list.notCreated')}</Badge>
        ) : row.hasDraftChanges ? (
          <Badge variant="warning">{t('layout.list.draftChanges')}</Badge>
        ) : row.isPublished ? (
          <Badge variant="success">{t('layout.list.published')}</Badge>
        ) : (
          <Badge variant="outline">{t('layout.list.notPublished')}</Badge>
        ),
    },
    {
      key: 'rows',
      header: t('layout.list.rows'),
      hideBelow: 'md',
      cell: (row) => (row.exists ? t('layout.list.rowCount', { count: row.rowCount }) : '–'),
    },
    {
      key: 'publishedAt',
      header: t('common.published'),
      hideBelow: 'md',
      cell: (row) => (row.publishedAt ? formatRelative(row.publishedAt) : '–'),
    },
    {
      key: 'updatedAt',
      header: t('common.updated'),
      hideBelow: 'lg',
      cell: (row) => (row.updatedAt ? formatRelative(row.updatedAt) : '–'),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (row) =>
        row.exists ? (
          <Button variant="outline" size="sm" leftIcon={<Pencil />} asChild>
            <Link href={adminPaths.layout(row.key)}>{t('common.edit')}</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Plus />}
            disabled={!canEdit}
            loading={creating === row.key}
            onClick={() => void create(row.key)}
          >
            {t('common.create')}
          </Button>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey="key"
      onRowClick={(row) =>
        row.exists ? router.push(adminPaths.layout(row.key)) : canEdit ? void create(row.key) : undefined
      }
      emptyState={<EmptyState title={t('layout.list.empty')} />}
    />
  );
}
