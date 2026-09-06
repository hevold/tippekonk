'use client';
/**
 * RedirectsClient — list with search, create/edit dialog, delete
 * confirmation, CSV import and a "test a path" tool. The list itself is
 * server-rendered data passed in; filters live in the URL.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskConical, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { FilterBar } from '@/components/admin/filter-bar';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { formatDateTime, formatNumber } from '@/components/ui/format';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Pagination } from '@/components/ui/pagination';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import type { Redirect } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import {
  REDIRECT_STATUS_CODES,
  type ImportResult,
  type RedirectLookup,
  type RedirectPage,
} from '@/server/redirects/schema';
import {
  createRedirectAction,
  deleteRedirectAction,
  importRedirectsAction,
  testRedirectAction,
  updateRedirectAction,
} from '@/server/redirects/actions';

import { applyFieldErrors } from './settings-form';

/** Client-side shape check; the server applies the full rules (normalisation, loops, uniqueness). */
const formSchema = z.object({
  fromPath: z
    .string()
    .trim()
    .min(1, 'Fra-sti må fylles ut')
    .refine((v) => v.startsWith('/'), 'Fra-sti må starte med /'),
  toPath: z.string().trim().min(1, 'Til-sti må fylles ut'),
  statusCode: z.coerce.number().int(),
});
type FormValues = z.input<typeof formSchema>;

type SerializableRedirect = Omit<Redirect, 'createdAt'> & { createdAt: string };

export type RedirectsClientProps = {
  page: Omit<RedirectPage, 'items'> & { items: SerializableRedirect[] };
  query: { q: string; sort: string };
};

function RedirectDialog({
  open,
  onOpenChange,
  redirect,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirect: SerializableRedirect | null;
  onSaved: () => void;
}) {
  const t = useT();
  const form = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: redirect
      ? { fromPath: redirect.fromPath, toPath: redirect.toPath, statusCode: redirect.statusCode }
      : { fromPath: '/', toPath: '/', statusCode: 301 },
  });
  const { register, handleSubmit, formState, reset } = form;
  const [error, setError] = useState<string | null>(null);

  const submit = handleSubmit(async (values) => {
    setError(null);
    const result = redirect
      ? await updateRedirectAction(redirect.id, values)
      : await createRedirectAction(values);
    if (!result.ok) {
      applyFieldErrors(form, result.fieldErrors);
      setError(result.error);
      return;
    }
    toast.success(redirect ? t('settings.redirects.updatedToast') : t('settings.redirects.createdToast'));
    reset();
    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
      title={redirect ? t('settings.redirects.edit') : t('settings.redirects.new')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={formState.isSubmitting}>
            {redirect ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <FormField
          label={t('settings.redirects.fromPath')}
          required
          help={t('settings.redirects.fromPathHelp')}
          error={formState.errors.fromPath?.message}
        >
          <Input {...register('fromPath')} className="font-mono" spellCheck={false} autoFocus />
        </FormField>
        <FormField
          label={t('settings.redirects.toPath')}
          required
          help={t('settings.redirects.toPathHelp')}
          error={formState.errors.toPath?.message}
        >
          <Input {...register('toPath')} className="font-mono" spellCheck={false} />
        </FormField>
        <FormField label={t('settings.redirects.statusCode')} error={formState.errors.statusCode?.message}>
          <NativeSelect
            {...register('statusCode')}
            options={REDIRECT_STATUS_CODES.map((code) => ({
              value: String(code),
              label: t(`settings.redirects.status.${code}`),
            }))}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [csv, setCsv] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run() {
    setPending(true);
    try {
      const res = await importRedirectsAction(csv);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      toast.success(
        t('settings.redirects.importResult', {
          created: res.data.created,
          updated: res.data.updated,
          skipped: res.data.issues.length,
        }),
      );
      onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setResult(null);
          setCsv('');
        }
        onOpenChange(o);
      }}
      title={t('settings.redirects.importTitle')}
      description={t('settings.redirects.importHelp')}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button onClick={() => void run()} loading={pending} disabled={!csv.trim()} leftIcon={<Upload />}>
            {t('settings.redirects.importButton')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormField label="CSV">
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={8}
            className="font-mono text-[13px]"
            placeholder={t('settings.redirects.importPlaceholder')}
            spellCheck={false}
          />
        </FormField>
        {result ? (
          <Alert
            variant={result.issues.length > 0 ? 'warning' : 'success'}
            title={t('settings.redirects.importResult', {
              created: result.created,
              updated: result.updated,
              skipped: result.issues.length,
            })}
          >
            {result.issues.length > 0 ? (
              <div className="grid gap-1">
                <p className="font-medium">{t('settings.redirects.importIssues')}</p>
                <ul className="list-disc pl-5">
                  {result.issues.slice(0, 50).map((issue) => (
                    <li key={`${issue.line}-${issue.message}`}>
                      {t('settings.redirects.importLine', { line: issue.line, message: issue.message })}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

function TestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const [path, setPath] = useState('/');
  const [pending, setPending] = useState(false);
  const [lookup, setLookup] = useState<RedirectLookup | null>(null);

  async function run() {
    setPending(true);
    try {
      const res = await testRedirectAction(path);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLookup(res.data);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('settings.redirects.testTitle')}
      description={t('settings.redirects.testHelp')}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="flex items-end gap-2">
          <FormField label={t('settings.redirects.testPath')} className="flex-1">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="font-mono"
              spellCheck={false}
              autoFocus
            />
          </FormField>
          <Button type="submit" loading={pending} leftIcon={<FlaskConical />}>
            {t('settings.redirects.testRun')}
          </Button>
        </div>
        {lookup ? (
          lookup.chain.length === 0 ? (
            <Alert variant="info">{t('settings.redirects.testNoMatch', { path })}</Alert>
          ) : (
            <Alert
              variant={lookup.loops ? 'danger' : 'success'}
              title={t('settings.redirects.testResult', { path, target: lookup.finalPath })}
            >
              {lookup.loops ? <p className="font-medium">{t('settings.redirects.testLoop')}</p> : null}
              {lookup.chain.length > 1 || lookup.loops ? (
                <div className="mt-1 grid gap-0.5">
                  <p className="font-medium">
                    {t('settings.redirects.testChain', { count: lookup.chain.length })}
                  </p>
                  <ol className="list-decimal pl-5 font-mono text-[12px]">
                    {lookup.chain.map((hop, i) => (
                      <li key={`${hop.fromPath}-${i}`}>
                        {hop.fromPath} → {hop.toPath} ({hop.statusCode})
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </Alert>
          )
        ) : null}
      </form>
    </Dialog>
  );
}

export function RedirectsClient({ page, query }: RedirectsClientProps) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<SerializableRedirect | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [deleting, setDeleting] = useState<SerializableRedirect | null>(null);

  function navigate(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    if (!('page' in patch)) params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const refresh = () => router.refresh();

  async function confirmDelete() {
    if (!deleting) return;
    const res = await deleteRedirectAction(deleting.id);
    if (!res.ok) throw new Error(res.error);
    toast.success(t('settings.redirects.deletedToast'));
    refresh();
  }

  const columns: ColumnDef<SerializableRedirect>[] = [
    {
      key: 'fromPath',
      header: t('settings.redirects.fromPath'),
      cell: (r) => <span className="font-mono text-[13px]">{r.fromPath}</span>,
    },
    {
      key: 'toPath',
      header: t('settings.redirects.toPath'),
      cell: (r) => <span className="font-mono text-[13px] break-all">{r.toPath}</span>,
    },
    {
      key: 'statusCode',
      header: t('settings.redirects.statusCode'),
      width: 90,
      cell: (r) => <Badge variant="outline">{r.statusCode}</Badge>,
    },
    {
      key: 'hits',
      header: t('settings.redirects.hits'),
      width: 80,
      align: 'right',
      cell: (r) => <span className="tabular-nums">{formatNumber(r.hits)}</span>,
    },
    {
      key: 'createdAt',
      header: t('settings.redirects.created'),
      width: 160,
      hideBelow: 'md',
      cell: (r) => <span className="text-muted">{formatDateTime(r.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      width: 48,
      align: 'right',
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" label={t('settings.redirects.actions', { from: r.fromPath })} noTooltip>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(r)}>
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive icon={<Trash2 />} onSelect={() => setDeleting(r)}>
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const pageCount = Math.max(1, Math.ceil(page.total / page.perPage));
  const hrefFor = (n: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(n));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="grid gap-4">
      <FilterBar
        search={{
          value: query.q,
          onChange: (v) => navigate({ q: v || undefined }),
          placeholder: t('settings.redirects.searchPlaceholder'),
        }}
        activeCount={query.q ? 1 : 0}
        onReset={() => navigate({ q: undefined, sort: undefined })}
        end={
          <>
            <span className="text-muted text-sm">{t('settings.redirects.count', { count: page.total })}</span>
            <Button variant="outline" size="sm" leftIcon={<FlaskConical />} onClick={() => setTestOpen(true)}>
              {t('settings.redirects.test')}
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Upload />} onClick={() => setImportOpen(true)}>
              {t('settings.redirects.import')}
            </Button>
            <Button size="sm" leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>
              {t('settings.redirects.new')}
            </Button>
          </>
        }
      >
        <NativeSelect
          size="sm"
          aria-label={t('common.status')}
          value={query.sort}
          onChange={(e) => navigate({ sort: e.target.value === 'created' ? undefined : e.target.value })}
          options={[
            { value: 'created', label: t('settings.redirects.created') },
            { value: 'hits', label: t('settings.redirects.hits') },
            { value: 'from', label: t('settings.redirects.fromPath') },
          ]}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={page.items}
        rowKey="id"
        onRowClick={(r) => setEditing(r)}
        emptyState={
          query.q ? (
            <EmptyState compact title={t('settings.redirects.noResults')} />
          ) : (
            <EmptyState
              compact
              title={t('settings.redirects.empty')}
              description={t('settings.redirects.emptyHelp')}
              action={
                <Button size="sm" leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>
                  {t('settings.redirects.new')}
                </Button>
              }
            />
          )
        }
      />
      <Pagination page={page.page} pageCount={pageCount} hrefFor={hrefFor} />

      <RedirectDialog open={createOpen} onOpenChange={setCreateOpen} redirect={null} onSaved={refresh} />
      <RedirectDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        redirect={editing}
        onSaved={refresh}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />
      <TestDialog open={testOpen} onOpenChange={setTestOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
        title={t('settings.redirects.delete')}
        description={deleting ? t('settings.redirects.deleteConfirm', { from: deleting.fromPath }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}
