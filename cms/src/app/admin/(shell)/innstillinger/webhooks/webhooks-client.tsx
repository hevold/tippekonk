'use client';
/**
 * Webhooks admin: list with active toggle, create/edit dialog (secret shown
 * once, regenerate), a test ping and a deliveries drawer with "Send på nytt".
 */
import { Check, Copy, Pencil, Plus, RefreshCw, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { formatDate, formatRelative } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import {
  createWebhookAction,
  deleteWebhookAction,
  listWebhookDeliveriesAction,
  redeliverWebhookAction,
  regenerateWebhookSecretAction,
  setWebhookActiveAction,
  testWebhookAction,
  updateWebhookAction,
} from '@/server/webhooks/actions';
import type { DeliveryDto, WebhookDto } from '@/server/webhooks/dto';

export type WebhooksClientProps = {
  webhooks: WebhookDto[];
  events: string[];
  canManage: boolean;
  /** Whether plain http:// endpoints are accepted (APP_URL itself is http). */
  allowHttp: boolean;
};

type FormState = { name: string; url: string; events: string[]; isActive: boolean };

const emptyForm = (events: string[]): FormState => ({
  name: '',
  url: '',
  events: [...events],
  isActive: true,
});

export function WebhooksClient({ webhooks: initial, events, canManage, allowHttp }: WebhooksClientProps) {
  const t = useT();
  const router = useRouter();
  const [hooks, setHooks] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookDto | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(events));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookDto | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<WebhookDto | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryDto[] | null>(null);
  const [deliveriesLoadedAt, setDeliveriesLoadedAt] = useState(0);
  const [testing, setTesting] = useState<string | null>(null);
  const [redelivering, setRedelivering] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(events));
    setErrors({});
    setSecret(null);
    setDialogOpen(true);
  }
  function openEdit(hook: WebhookDto) {
    setEditing(hook);
    setForm({ name: hook.name, url: hook.url, events: hook.events, isActive: hook.isActive });
    setErrors({});
    setSecret(null);
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setSecret(null);
    setEditing(null);
  }

  async function submit() {
    setPending(true);
    setErrors({});
    try {
      if (editing) {
        const res = await updateWebhookAction({ id: editing.id, input: form });
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        setHooks((prev) => prev.map((h) => (h.id === res.data.id ? res.data : h)));
        toast.success(t('common.saved'));
        closeDialog();
      } else {
        const res = await createWebhookAction(form);
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        setHooks((prev) => [res.data.webhook, ...prev]);
        setEditing(res.data.webhook);
        setSecret(res.data.secret);
        toast.success(t('integrations.webhooks.createdToast'));
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function regenerate() {
    if (!editing) return;
    const res = await regenerateWebhookSecretAction({ id: editing.id });
    if (!res.ok) throw new Error(res.error);
    setSecret(res.data.secret);
  }

  async function toggleActive(hook: WebhookDto, isActive: boolean) {
    setHooks((prev) => prev.map((h) => (h.id === hook.id ? { ...h, isActive } : h)));
    const res = await setWebhookActiveAction({ id: hook.id, isActive });
    if (!res.ok) {
      setHooks((prev) => prev.map((h) => (h.id === hook.id ? hook : h)));
      toast.error(res.error);
      return;
    }
    setHooks((prev) => prev.map((h) => (h.id === res.data.id ? res.data : h)));
  }

  async function remove() {
    if (!deleteTarget) return;
    const res = await deleteWebhookAction({ id: deleteTarget.id });
    if (!res.ok) throw new Error(res.error);
    setHooks((prev) => prev.filter((h) => h.id !== deleteTarget.id));
    toast.success(t('integrations.webhooks.deletedToast'));
    router.refresh();
  }

  async function test(hook: WebhookDto) {
    setTesting(hook.id);
    try {
      const res = await testWebhookAction({ id: hook.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data.status === 'delivered')
        toast.success(t('integrations.webhooks.testOk', { code: res.data.lastStatusCode ?? '' }));
      else toast.error(t('integrations.webhooks.testFailed', { error: res.data.lastError ?? '' }));
      if (deliveriesFor?.id === hook.id) setDeliveries((prev) => [res.data, ...(prev ?? [])]);
      setHooks((prev) =>
        prev.map((h) =>
          h.id === hook.id
            ? {
                ...h,
                deliveryCount: h.deliveryCount + 1,
                failedCount: h.failedCount + (res.data.status === 'failed' ? 1 : 0),
                lastDeliveryAt: res.data.createdAt,
              }
            : h,
        ),
      );
    } finally {
      setTesting(null);
    }
  }

  async function openDeliveries(hook: WebhookDto) {
    setDeliveriesFor(hook);
    setDeliveries(null);
    const res = await listWebhookDeliveriesAction({ id: hook.id, limit: 100 });
    if (!res.ok) {
      toast.error(res.error);
      setDeliveries([]);
      return;
    }
    setDeliveries(res.data);
    setDeliveriesLoadedAt(Date.now());
  }

  async function redeliver(delivery: DeliveryDto) {
    setRedelivering(delivery.id);
    try {
      const res = await redeliverWebhookAction({ id: delivery.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDeliveries((prev) => (prev ?? []).map((d) => (d.id === res.data.id ? res.data : d)));
      if (res.data.status === 'delivered') toast.success(t('integrations.webhooks.redeliverOk'));
      else toast.error(t('integrations.webhooks.redeliverFailed', { error: res.data.lastError ?? '' }));
    } finally {
      setRedelivering(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('integrations.apiKeys.copyFailed'));
    }
  }

  const columns: ColumnDef<WebhookDto>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium">{row.name}</div>
          <div className="text-muted max-w-xs truncate font-mono text-xs">{row.url}</div>
        </div>
      ),
    },
    {
      key: 'events',
      header: t('integrations.webhooks.events'),
      hideBelow: 'lg',
      cell: (row) => (
        <div className="flex max-w-sm flex-wrap gap-1">
          {row.events.map((e) => (
            <Badge key={e} variant="outline">
              {e}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'isActive',
      header: t('integrations.webhooks.active'),
      cell: (row) => (
        <Switch
          size="sm"
          checked={row.isActive}
          disabled={!canManage}
          aria-label={t('integrations.webhooks.activeAria', { name: row.name })}
          onCheckedChange={(v) => void toggleActive(row, v)}
        />
      ),
    },
    {
      key: 'deliveries',
      header: t('integrations.webhooks.deliveries'),
      hideBelow: 'md',
      cell: (row) => (
        <button
          type="button"
          className="text-primary text-sm underline-offset-2 hover:underline"
          onClick={() => void openDeliveries(row)}
        >
          {row.deliveryCount}
          {row.failedCount ? (
            <span className="text-danger">
              {' '}
              ({t('integrations.webhooks.failedCount', { count: row.failedCount })})
            </span>
          ) : null}
        </button>
      ),
    },
    {
      key: 'lastDeliveryAt',
      header: t('integrations.webhooks.lastDelivery'),
      hideBelow: 'md',
      cell: (row) => (row.lastDeliveryAt ? formatRelative(row.lastDeliveryAt) : t('common.never')),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Send />}
            disabled={!canManage}
            loading={testing === row.id}
            onClick={() => void test(row)}
          >
            {t('integrations.webhooks.test')}
          </Button>
          <IconButton label={t('common.edit')} size="sm" disabled={!canManage} onClick={() => openEdit(row)}>
            <Pencil />
          </IconButton>
          <IconButton
            label={t('common.delete')}
            size="sm"
            disabled={!canManage}
            onClick={() => setDeleteTarget(row)}
          >
            <Trash2 />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button leftIcon={<Plus />} disabled={!canManage} onClick={openCreate}>
          {t('integrations.webhooks.create')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={hooks}
        rowKey="id"
        emptyState={
          <EmptyState
            icon={<WebhookIcon className="size-6" />}
            title={t('integrations.webhooks.emptyTitle')}
            description={t('integrations.webhooks.emptyDescription')}
            action={
              canManage ? (
                <Button leftIcon={<Plus />} onClick={openCreate}>
                  {t('integrations.webhooks.create')}
                </Button>
              ) : undefined
            }
          />
        }
      />
      <p className="text-muted text-sm">{t('integrations.webhooks.signatureHelp')}</p>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => !open && closeDialog()}
        title={
          secret
            ? t('integrations.webhooks.secretTitle')
            : editing
              ? t('integrations.webhooks.edit')
              : t('integrations.webhooks.create')
        }
        description={secret ? undefined : t('integrations.webhooks.dialogDescription')}
        size="lg"
        footer={
          secret ? (
            <Button variant="primary" onClick={closeDialog}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              {editing ? (
                <Button
                  variant="outline"
                  leftIcon={<RefreshCw />}
                  onClick={() => setRegenOpen(true)}
                  disabled={pending}
                >
                  {t('integrations.webhooks.regenerate')}
                </Button>
              ) : null}
              <span className="flex-1" />
              <Button variant="ghost" onClick={closeDialog} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void submit()} loading={pending}>
                {editing ? t('common.save') : t('common.create')}
              </Button>
            </>
          )
        }
      >
        {secret ? (
          <div className="flex flex-col gap-3">
            <Alert variant="warning">{t('integrations.webhooks.secretOnce')}</Alert>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={secret}
                aria-label={t('integrations.webhooks.secret')}
                className="font-mono text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                leftIcon={copied ? <Check /> : <Copy />}
                onClick={() => void copy(secret)}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <FormField label={t('common.name')} required htmlFor="webhook-name" error={errors.name?.[0]}>
              <Input
                id="webhook-name"
                value={form.name}
                maxLength={120}
                autoFocus
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField
              label={t('integrations.webhooks.url')}
              required
              htmlFor="webhook-url"
              error={errors.url?.[0]}
              help={allowHttp ? t('integrations.webhooks.urlHelpHttp') : t('integrations.webhooks.urlHelp')}
            >
              <Input
                id="webhook-url"
                type="url"
                value={form.url}
                maxLength={2000}
                placeholder="https://"
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
            </FormField>
            <FormField label={t('integrations.webhooks.events')} error={errors.events?.[0]}>
              <div className="grid gap-2 sm:grid-cols-2">
                {events.map((event) => (
                  <Checkbox
                    key={event}
                    label={<code className="text-sm">{event}</code>}
                    description={t(`integrations.webhooks.event.${event}`)}
                    checked={form.events.includes(event)}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        events:
                          checked === true ? [...form.events, event] : form.events.filter((e) => e !== event),
                      })
                    }
                  />
                ))}
              </div>
            </FormField>
            <Switch
              label={t('integrations.webhooks.active')}
              checked={form.isActive}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })}
            />
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title={t('integrations.webhooks.regenerateTitle')}
        description={t('integrations.webhooks.regenerateDescription')}
        confirmLabel={t('integrations.webhooks.regenerate')}
        destructive
        onConfirm={regenerate}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('integrations.webhooks.deleteTitle')}
        description={t('integrations.webhooks.deleteDescription', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={remove}
      />

      <Sheet
        open={deliveriesFor !== null}
        onOpenChange={(open) => !open && setDeliveriesFor(null)}
        title={t('integrations.webhooks.deliveriesTitle', { name: deliveriesFor?.name ?? '' })}
        description={deliveriesFor?.url}
        size="lg"
      >
        {deliveries === null ? (
          <div className="flex justify-center py-10">
            <Spinner label={t('common.loading')} />
          </div>
        ) : deliveries.length === 0 ? (
          <EmptyState compact title={t('integrations.webhooks.noDeliveries')} />
        ) : (
          <ol className="flex flex-col gap-3">
            {deliveries.map((d) => (
              <li key={d.id} className="border-border rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <DeliveryStatusBadge status={d.status} />
                  <code className="text-xs">{d.event}</code>
                  <span className="text-muted text-xs">{formatDate(d.createdAt, 'datetime')}</span>
                  <span className="flex-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<RefreshCw />}
                    disabled={!canManage}
                    loading={redelivering === d.id}
                    onClick={() => void redeliver(d)}
                  >
                    {t('integrations.webhooks.redeliver')}
                  </Button>
                </div>
                <dl className="text-muted mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <dt>{t('integrations.webhooks.attempts')}</dt>
                  <dd>{d.attempts}</dd>
                  <dt>{t('integrations.webhooks.statusCode')}</dt>
                  <dd>{d.lastStatusCode ?? '–'}</dd>
                  {d.deliveredAt ? (
                    <>
                      <dt>{t('integrations.webhooks.deliveredAt')}</dt>
                      <dd>{formatDate(d.deliveredAt, 'datetime')}</dd>
                    </>
                  ) : d.status !== 'failed' ? (
                    <>
                      <dt>{t('integrations.webhooks.nextAttempt')}</dt>
                      <dd>
                        {new Date(d.nextAttemptAt).getTime() <= deliveriesLoadedAt
                          ? t('integrations.webhooks.asap')
                          : formatRelative(d.nextAttemptAt)}
                      </dd>
                    </>
                  ) : null}
                  {d.lastError ? (
                    <>
                      <dt>{t('integrations.webhooks.error')}</dt>
                      <dd className="text-danger break-words">{d.lastError}</dd>
                    </>
                  ) : null}
                </dl>
                <details className="mt-2">
                  <summary className="text-muted cursor-pointer text-xs">
                    {t('integrations.webhooks.payload')}
                  </summary>
                  <pre className="bg-surface-2 mt-1 max-h-64 overflow-auto rounded p-2 font-mono text-[11px] leading-4">
                    {JSON.stringify(d.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </Sheet>
    </div>
  );
}

function DeliveryStatusBadge({ status }: { status: DeliveryDto['status'] }) {
  const t = useT();
  const variant =
    status === 'delivered'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'retrying'
          ? 'warning'
          : 'muted';
  return <Badge variant={variant}>{t(`integrations.webhooks.status.${status}`)}</Badge>;
}
