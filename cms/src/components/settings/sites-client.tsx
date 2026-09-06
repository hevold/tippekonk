'use client';
/**
 * SitesClient — superadmin list of every site with create, edit,
 * activate/deactivate, delete (type the slug) and "switch to" (sets the
 * desken_site cookie through the shell's switchSite action).
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { switchSite } from '@/components/admin/shell-actions';
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
import { FormField } from '@/components/ui/form-field';
import { formatNumber } from '@/components/ui/format';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n/client';
import { slugify } from '@/lib/text/slug';
import { slugSchema } from '@/lib/validation/common';
import { SITE_LOCALES, TIMEZONES } from '@/server/settings/schema';
import {
  createSiteAction,
  deleteSiteAction,
  setSiteActiveAction,
  updateSiteAction,
} from '@/server/sites/admin-actions';

import { DomainsInput } from './domains-input';
import { applyFieldErrors } from './settings-form';

export type SiteRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  domains: string[];
  locale: string;
  timezone: string;
  isActive: boolean;
  members: number;
  articles: number;
};

const createSchema = z.object({
  name: z.string().trim().min(1, 'Navn må fylles ut').max(120, 'Maks 120 tegn'),
  slug: slugSchema,
  tagline: z.string().trim().max(200, 'Maks 200 tegn'),
  domains: z.array(z.string()),
  locale: z.enum(SITE_LOCALES),
});
type CreateValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().trim().min(1, 'Navn må fylles ut').max(120, 'Maks 120 tegn'),
  tagline: z.string().trim().max(200, 'Maks 200 tegn'),
  domains: z.array(z.string()),
  locale: z.enum(SITE_LOCALES),
  timezone: z.string().min(1),
  isActive: z.boolean(),
});
type EditValues = z.infer<typeof editSchema>;

function CreateSiteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', slug: '', tagline: '', domains: [], locale: 'nb' },
  });
  const { register, control, handleSubmit, formState, reset, setValue, getFieldState } = form;

  const submit = handleSubmit(async (values) => {
    setError(null);
    const result = await createSiteAction(values);
    if (!result.ok) {
      applyFieldErrors(form, result.fieldErrors);
      setError(result.error);
      return;
    }
    toast.success(t('settings.sites.createdToast', { name: result.data.name }));
    reset();
    onOpenChange(false);
    router.refresh();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          setError(null);
        }
        onOpenChange(o);
      }}
      title={t('settings.sites.new')}
      description={t('settings.sites.createHelp')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={formState.isSubmitting}>
            {t('common.create')}
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
        <FormField label={t('settings.sites.name')} required error={formState.errors.name?.message}>
          <Input
            {...register('name', {
              onChange: (e) => {
                if (!getFieldState('slug').isDirty) setValue('slug', slugify(String(e.target.value)));
              },
            })}
            autoFocus
          />
        </FormField>
        <FormField
          label={t('settings.sites.slug')}
          required
          help={t('settings.sites.slugHelp')}
          error={formState.errors.slug?.message}
        >
          <Input {...register('slug')} className="font-mono" spellCheck={false} />
        </FormField>
        <FormField label={t('settings.sites.tagline')} error={formState.errors.tagline?.message}>
          <Input {...register('tagline')} />
        </FormField>
        <Controller
          control={control}
          name="domains"
          render={({ field, fieldState }) => (
            <FormField
              label={t('settings.sites.domains')}
              help={t('settings.general.domainsHelp')}
              error={fieldState.error?.message}
            >
              <DomainsInput
                value={field.value}
                onChange={field.onChange}
                placeholder={t('settings.general.domainsPlaceholder')}
              />
            </FormField>
          )}
        />
        <FormField label={t('settings.sites.locale')} error={formState.errors.locale?.message}>
          <NativeSelect
            {...register('locale')}
            options={SITE_LOCALES.map((l) => ({ value: l, label: t(`settings.general.locale.${l}`) }))}
          />
        </FormField>
      </form>
    </Dialog>
  );
}

function EditSiteDialog({
  site,
  onOpenChange,
}: {
  site: SiteRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: site
      ? {
          name: site.name,
          tagline: site.tagline ?? '',
          domains: site.domains,
          locale: site.locale === 'nn' ? 'nn' : 'nb',
          timezone: site.timezone,
          isActive: site.isActive,
        }
      : { name: '', tagline: '', domains: [], locale: 'nb', timezone: 'Europe/Oslo', isActive: true },
  });
  const { register, control, handleSubmit, formState } = form;

  const submit = handleSubmit(async (values) => {
    if (!site) return;
    setError(null);
    const result = await updateSiteAction(site.id, values);
    if (!result.ok) {
      applyFieldErrors(form, result.fieldErrors);
      setError(result.error);
      return;
    }
    toast.success(t('settings.sites.updatedToast'));
    onOpenChange(false);
    router.refresh();
  });

  const timezones =
    site && !TIMEZONES.includes(site.timezone as (typeof TIMEZONES)[number])
      ? [site.timezone, ...TIMEZONES]
      : [...TIMEZONES];

  return (
    <Dialog
      open={site !== null}
      onOpenChange={(o) => {
        if (!o) setError(null);
        onOpenChange(o);
      }}
      title={t('settings.sites.edit')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={formState.isSubmitting}>
            {t('common.save')}
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
        <FormField label={t('settings.sites.name')} required error={formState.errors.name?.message}>
          <Input {...register('name')} />
        </FormField>
        <FormField label={t('settings.sites.slug')}>
          <Input value={site?.slug ?? ''} readOnly disabled className="font-mono" />
        </FormField>
        <FormField label={t('settings.sites.tagline')} error={formState.errors.tagline?.message}>
          <Input {...register('tagline')} />
        </FormField>
        <Controller
          control={control}
          name="domains"
          render={({ field, fieldState }) => (
            <FormField label={t('settings.sites.domains')} error={fieldState.error?.message}>
              <DomainsInput
                value={field.value}
                onChange={field.onChange}
                placeholder={t('settings.general.domainsPlaceholder')}
              />
            </FormField>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('settings.sites.locale')}>
            <NativeSelect
              {...register('locale')}
              options={SITE_LOCALES.map((l) => ({ value: l, label: t(`settings.general.locale.${l}`) }))}
            />
          </FormField>
          <FormField label={t('settings.general.timezone')}>
            <NativeSelect
              {...register('timezone')}
              options={timezones.map((tz) => ({ value: tz, label: tz }))}
            />
          </FormField>
        </div>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              label={t('settings.general.isActive')}
              description={t('settings.general.isActiveHelp')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </form>
    </Dialog>
  );
}

function DeleteSiteDialog({
  site,
  onOpenChange,
}: {
  site: SiteRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = site !== null && confirm.trim().toLowerCase() === site.slug;

  async function run() {
    if (!site) return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteSiteAction({ id: site.id, confirmSlug: confirm });
      if (!result.ok) {
        setError(result.fieldErrors?.confirmSlug?.[0] ?? result.error);
        return;
      }
      toast.success(t('settings.sites.deletedToast'));
      setConfirm('');
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={site !== null}
      onOpenChange={(o) => {
        if (!o) {
          setConfirm('');
          setError(null);
        }
        onOpenChange(o);
      }}
      title={site ? t('settings.sites.deleteTitle', { name: site.name }) : ''}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!matches}
            loading={pending}
            onClick={() => void run()}
            leftIcon={<Trash2 />}
          >
            {t('settings.sites.deleteButton')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Alert variant="danger">{t('settings.sites.deleteWarning')}</Alert>
        <FormField
          label={site ? t('settings.sites.deleteConfirmLabel', { slug: site.slug }) : ''}
          error={error}
        >
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
        </FormField>
      </div>
    </Dialog>
  );
}

export function SitesClient({ sites, currentSiteId }: { sites: SiteRow[]; currentSiteId: string }) {
  const t = useT();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<SiteRow | null>(null);
  const [deleting, setDeleting] = useState<SiteRow | null>(null);
  const [toggling, setToggling] = useState<SiteRow | null>(null);

  async function switchTo(site: SiteRow) {
    const result = await switchSite(site.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('settings.sites.switchedToast', { site: site.name }));
    router.push('/admin');
    router.refresh();
  }

  async function toggleActive() {
    if (!toggling) return;
    const result = await setSiteActiveAction(toggling.id, !toggling.isActive);
    if (!result.ok) throw new Error(result.error);
    toast.success(
      result.data.isActive ? t('settings.sites.activatedToast') : t('settings.sites.deactivatedToast'),
    );
    router.refresh();
  }

  const columns: ColumnDef<SiteRow>[] = [
    {
      key: 'name',
      header: t('settings.sites.name'),
      cell: (s) => (
        <div className="grid">
          <span className="flex items-center gap-2 font-medium">
            {s.name}
            {s.id === currentSiteId ? <Badge>{t('settings.sites.current')}</Badge> : null}
          </span>
          <span className="text-muted font-mono text-[12px]">{s.slug}</span>
        </div>
      ),
    },
    {
      key: 'domains',
      header: t('settings.sites.domains'),
      hideBelow: 'md',
      cell: (s) => (
        <span className="font-mono text-[12px]">{s.domains.length > 0 ? s.domains.join(', ') : '–'}</span>
      ),
    },
    {
      key: 'locale',
      header: t('settings.sites.locale'),
      width: 90,
      hideBelow: 'lg',
      cell: (s) => t(`settings.general.locale.${s.locale === 'nn' ? 'nn' : 'nb'}`),
    },
    {
      key: 'members',
      header: t('settings.sites.members'),
      width: 100,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.members)}</span>,
    },
    {
      key: 'articles',
      header: t('settings.sites.articles'),
      width: 80,
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatNumber(s.articles)}</span>,
    },
    {
      key: 'status',
      header: t('settings.sites.status'),
      width: 100,
      cell: (s) => (
        <Badge variant={s.isActive ? 'success' : 'muted'}>
          {s.isActive ? t('settings.sites.active') : t('settings.sites.inactive')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      width: 48,
      align: 'right',
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" label={t('settings.sites.actions', { name: s.name })} noTooltip>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {s.id !== currentSiteId && s.isActive ? (
              <DropdownMenuItem icon={<ArrowRightLeft />} onSelect={() => void switchTo(s)}>
                {t('settings.sites.switch')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(s)}>
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Power />} onSelect={() => setToggling(s)}>
              {s.isActive ? t('settings.sites.deactivate') : t('settings.sites.activate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              icon={<Trash2 />}
              onSelect={() => setDeleting(s)}
              disabled={sites.length <= 1}
            >
              {t('settings.sites.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted text-sm">{t('settings.sites.count', { count: sites.length })}</span>
        <Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>
          {t('settings.sites.new')}
        </Button>
      </div>
      <DataTable columns={columns} rows={sites} rowKey="id" onRowClick={(s) => setEditing(s)} />

      <CreateSiteDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditSiteDialog
        site={editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
      <DeleteSiteDialog
        site={deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={toggling !== null}
        onOpenChange={(o) => {
          if (!o) setToggling(null);
        }}
        title={
          toggling ? (toggling.isActive ? t('settings.sites.deactivate') : t('settings.sites.activate')) : ''
        }
        description={toggling ? `${toggling.name} (${toggling.slug})` : ''}
        confirmLabel={toggling?.isActive ? t('settings.sites.deactivate') : t('settings.sites.activate')}
        destructive={toggling?.isActive}
        onConfirm={toggleActive}
      />
    </div>
  );
}
