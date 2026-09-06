'use client';
/**
 * API keys admin: list, create (the raw key is shown exactly once with a
 * copy button), revoke with confirmation, and a usage snippet.
 */
import { Check, Copy, KeyRound, Plus, ShieldOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { formatDate, formatRelative } from '@/lib/dates';
import { useT } from '@/lib/i18n/client';
import { createApiKeyAction, revokeApiKeyAction } from '@/server/api-keys/actions';
import type { ApiKeyDto } from '@/server/api-keys';

export function ApiKeysClient({
  keys: initialKeys,
  baseUrl,
  canManage,
}: {
  keys: ApiKeyDto[];
  baseUrl: string;
  canManage: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setPending(true);
    setErrors({});
    try {
      const res = await createApiKeyAction({ name, scopes: ['content:read'] });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setKeys((prev) => [res.data.apiKey, ...prev]);
      setRawKey(res.data.raw);
      setName('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!revokeId) return;
    const res = await revokeApiKeyAction(revokeId);
    if (!res.ok) throw new Error(res.error);
    setKeys((prev) => prev.map((k) => (k.id === res.data.id ? res.data : k)));
    toast.success(t('integrations.apiKeys.revokedToast'));
    router.refresh();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('integrations.apiKeys.copyFailed'));
    }
  }

  function closeCreate(open: boolean) {
    if (!open) {
      setCreateOpen(false);
      setRawKey(null);
      setErrors({});
    } else {
      setCreateOpen(true);
    }
  }

  const exampleKey = rawKey ?? 'dsk_DIN_NØKKEL';
  const curl = `curl -H "Authorization: Bearer ${exampleKey}" \\\n  "${baseUrl}/api/v1/articles?per_page=5"`;

  const columns: ColumnDef<ApiKeyDto>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (row) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <code className="text-muted text-xs">{row.keyPrefix}…</code>
        </div>
      ),
    },
    {
      key: 'scopes',
      header: t('integrations.apiKeys.scopes'),
      hideBelow: 'md',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.scopes.map((s) => (
            <Badge key={s} variant="outline">
              {s}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('common.status'),
      cell: (row) =>
        row.revokedAt ? (
          <Badge variant="muted">{t('integrations.apiKeys.revoked')}</Badge>
        ) : (
          <Badge variant="success">{t('integrations.apiKeys.active')}</Badge>
        ),
    },
    {
      key: 'createdAt',
      header: t('common.created'),
      hideBelow: 'lg',
      cell: (row) => formatDate(row.createdAt, 'datetime'),
    },
    {
      key: 'lastUsedAt',
      header: t('integrations.apiKeys.lastUsed'),
      hideBelow: 'md',
      cell: (row) => (row.lastUsedAt ? formatRelative(row.lastUsedAt) : t('common.never')),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (row) =>
        row.revokedAt ? null : (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<ShieldOff />}
            disabled={!canManage}
            onClick={() => setRevokeId(row.id)}
          >
            {t('integrations.apiKeys.revoke')}
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button leftIcon={<Plus />} disabled={!canManage} onClick={() => setCreateOpen(true)}>
          {t('integrations.apiKeys.create')}
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={keys}
        rowKey="id"
        emptyState={
          <EmptyState
            icon={<KeyRound className="size-6" />}
            title={t('integrations.apiKeys.emptyTitle')}
            description={t('integrations.apiKeys.emptyDescription')}
            action={
              canManage ? (
                <Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>
                  {t('integrations.apiKeys.create')}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('integrations.apiKeys.docsTitle')}</CardTitle>
          <CardDescription>{t('integrations.apiKeys.docsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <pre className="bg-surface-2 overflow-x-auto rounded-md p-3 font-mono text-xs leading-5">
            {curl}
          </pre>
          <ul className="text-muted grid gap-1 sm:grid-cols-2">
            {[
              ['GET /api/v1/articles', t('integrations.apiKeys.ep.articles')],
              ['GET /api/v1/articles/:id', t('integrations.apiKeys.ep.article')],
              ['GET /api/v1/sections', t('integrations.apiKeys.ep.sections')],
              ['GET /api/v1/tags', t('integrations.apiKeys.ep.tags')],
              ['GET /api/v1/authors', t('integrations.apiKeys.ep.authors')],
              ['GET /api/v1/live/:slug', t('integrations.apiKeys.ep.live')],
              ['GET /api/v1/site', t('integrations.apiKeys.ep.site')],
            ].map(([path, label]) => (
              <li key={path}>
                <code className="text-text">{path}</code> — {label}
              </li>
            ))}
          </ul>
          <p className="text-muted">{t('integrations.apiKeys.docsFooter')}</p>
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={closeCreate}
        title={rawKey ? t('integrations.apiKeys.createdTitle') : t('integrations.apiKeys.create')}
        description={rawKey ? undefined : t('integrations.apiKeys.createDescription')}
        footer={
          rawKey ? (
            <Button variant="primary" onClick={() => closeCreate(false)}>
              {t('common.close')}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => closeCreate(false)} disabled={pending}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={() => void create()} loading={pending}>
                {t('common.create')}
              </Button>
            </>
          )
        }
      >
        {rawKey ? (
          <div className="flex flex-col gap-3">
            <Alert variant="warning">{t('integrations.apiKeys.showOnce')}</Alert>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={rawKey}
                aria-label={t('integrations.apiKeys.rawKey')}
                className="font-mono text-sm"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                leftIcon={copied ? <Check /> : <Copy />}
                onClick={() => void copy(rawKey)}
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
              void create();
            }}
          >
            <FormField
              label={t('common.name')}
              required
              htmlFor="api-key-name"
              error={errors.name?.[0]}
              help={t('integrations.apiKeys.nameHelp')}
            >
              <Input
                id="api-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </FormField>
            <p className="text-muted text-sm">{t('integrations.apiKeys.scopeNote')}</p>
          </form>
        )}
      </Dialog>

      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(open) => !open && setRevokeId(null)}
        title={t('integrations.apiKeys.revokeTitle')}
        description={t('integrations.apiKeys.revokeDescription')}
        confirmLabel={t('integrations.apiKeys.revoke')}
        destructive
        onConfirm={revoke}
      />
    </div>
  );
}
