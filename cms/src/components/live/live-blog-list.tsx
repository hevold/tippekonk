'use client';
/**
 * /admin/direkte list with status badges and a "Ny direktesending" dialog.
 */
import { Plus, Radio } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import type { LiveBlogStatus } from '@/db/schema';
import { formatRelative } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { createLiveBlogAction } from '@/server/live/actions';

import { LiveStatusBadge } from './live-status-badge';

export type LiveBlogListRow = {
  id: string;
  title: string;
  slug: string;
  status: LiveBlogStatus;
  postCount: number;
  lastPostAt: string | null;
  startedAt: string | null;
  updatedAt: string;
  articleTitle: string | null;
};

export function LiveBlogList({ rows, canManage }: { rows: LiveBlogListRow[]; canManage: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function create(startNow: boolean) {
    setPending(true);
    setErrors({});
    try {
      const res = await createLiveBlogAction({ title, description, status: startNow ? 'live' : 'draft' });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(t('live.list.createdToast'));
      setOpen(false);
      router.push(adminPaths.liveBlog(res.data.id));
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<LiveBlogListRow>[] = [
    {
      key: 'title',
      header: t('common.title'),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Radio className="text-muted size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="truncate font-medium">{row.title}</div>
            <div className="text-muted truncate text-xs">/direkte/{row.slug}</div>
          </div>
        </div>
      ),
    },
    { key: 'status', header: t('common.status'), cell: (row) => <LiveStatusBadge status={row.status} /> },
    { key: 'postCount', header: t('live.list.posts'), align: 'right', cell: (row) => row.postCount },
    {
      key: 'lastPostAt',
      header: t('live.list.lastPost'),
      hideBelow: 'md',
      cell: (row) => (row.lastPostAt ? formatRelative(row.lastPostAt) : '–'),
    },
    {
      key: 'articleTitle',
      header: t('live.list.article'),
      hideBelow: 'lg',
      cell: (row) => row.articleTitle ?? '–',
    },
    {
      key: 'updatedAt',
      header: t('common.updated'),
      hideBelow: 'lg',
      cell: (row) => formatRelative(row.updatedAt),
    },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button leftIcon={<Plus />} disabled={!canManage} onClick={() => setOpen(true)}>
          {t('live.list.new')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="id"
        onRowClick={(row) => router.push(adminPaths.liveBlog(row.id))}
        emptyState={
          <EmptyState
            icon={<Radio className="size-6" />}
            title={t('live.list.emptyTitle')}
            description={t('live.list.emptyDescription')}
            action={
              canManage ? (
                <Button leftIcon={<Plus />} onClick={() => setOpen(true)}>
                  {t('live.list.new')}
                </Button>
              ) : undefined
            }
          />
        }
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('live.list.new')}
        description={t('live.list.newDescription')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button variant="secondary" onClick={() => void create(false)} loading={pending}>
              {t('live.list.createDraft')}
            </Button>
            <Button variant="primary" onClick={() => void create(true)} loading={pending}>
              {t('live.list.createAndStart')}
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create(false);
          }}
        >
          <FormField label={t('common.title')} required error={errors.title?.[0]} htmlFor="live-new-title">
            <Input
              id="live-new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </FormField>
          <FormField
            label={t('common.description')}
            error={errors.description?.[0]}
            htmlFor="live-new-description"
          >
            <Textarea
              id="live-new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
            />
          </FormField>
        </form>
      </Dialog>
    </>
  );
}
