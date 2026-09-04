'use client';
/**
 * UsersTable — the members list with a per-row action menu: change role,
 * deactivate/reactivate, remove from site, re-send invitation and (for
 * superadmins) toggle the superadmin flag. Destructive actions confirm first.
 */
import {
  MailPlus,
  MoreHorizontal,
  ShieldCheck,
  ShieldMinus,
  UserRoundCog,
  UserRoundMinus,
  UserRoundX,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeVariant } from '@/components/ui';
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
import { formatRelative } from '@/components/ui/format';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import type { MemberRole } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { ROLE_ORDER } from '@/lib/permissions';
import type { ActionResult } from '@/server/actions';
import {
  changeRoleAction,
  removeMemberAction,
  resendInviteAction,
  setSuperadminAction,
  setUserActiveAction,
} from '@/server/auth/actions';
import type { MemberStatus } from '@/server/auth/users';

export type MemberRow = {
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  isSuperadmin: boolean;
  isActive: boolean;
  totpEnabled: boolean;
  status: MemberStatus;
  /** ISO timestamps. */
  lastLoginAt: string | null;
  memberSince: string;
};

const STATUS_VARIANT: Record<MemberStatus, BadgeVariant> = {
  active: 'success',
  invited: 'info',
  inactive: 'muted',
};

const ROLES = [...ROLE_ORDER].reverse();

type PendingDialog =
  | { kind: 'role'; member: MemberRow }
  | { kind: 'deactivate'; member: MemberRow }
  | { kind: 'remove'; member: MemberRow }
  | { kind: 'superadmin'; member: MemberRow }
  | null;

export function UsersTable({
  rows,
  siteName,
  currentUserId,
  viewerIsSuperadmin,
}: {
  rows: MemberRow[];
  siteName: string;
  currentUserId: string;
  viewerIsSuperadmin: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [role, setRole] = useState<MemberRole>('journalist');
  const [, startTransition] = useTransition();

  async function run(action: () => Promise<ActionResult<unknown>>, successMessage: string): Promise<void> {
    const result = await action();
    if (!result.ok) throw new Error(result.error);
    toast.success(successMessage);
    startTransition(() => router.refresh());
  }

  function resend(member: MemberRow) {
    startTransition(async () => {
      const result = await resendInviteAction({ userId: member.userId });
      if (!result.ok) toast.error(result.error);
      else toast.success(t('users.toast.inviteResent'));
    });
  }

  function reactivate(member: MemberRow) {
    startTransition(async () => {
      const result = await setUserActiveAction({ userId: member.userId, isActive: true });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t('users.toast.reactivated', { name: member.name }));
        router.refresh();
      }
    });
  }

  function revokeSuperadmin(member: MemberRow) {
    startTransition(async () => {
      const result = await setSuperadminAction({ userId: member.userId, isSuperadmin: false });
      if (!result.ok) toast.error(result.error);
      else {
        toast.success(t('users.toast.superadminRevoked', { name: member.name }));
        router.refresh();
      }
    });
  }

  const columns: ColumnDef<MemberRow>[] = [
    {
      key: 'name',
      header: t('users.column.name'),
      cell: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.name} size="md" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-medium">
              {m.name}
              {m.userId === currentUserId ? (
                <span className="text-muted font-normal"> ({t('users.you')})</span>
              ) : null}
            </p>
            <p className="text-muted truncate text-[13px]">{m.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('users.column.role'),
      width: 200,
      cell: (m) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm">{t(`common.role.${m.role}`)}</span>
          {m.isSuperadmin ? <Badge variant="default">{t('users.superadmin')}</Badge> : null}
          {m.totpEnabled ? (
            <Badge variant="outline" title={t('users.profile.section.twoFactor')}>
              <ShieldCheck aria-hidden />
              {t('users.twoFactorOn')}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('users.column.status'),
      width: 130,
      cell: (m) => <Badge variant={STATUS_VARIANT[m.status]}>{t(`users.status.${m.status}`)}</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: t('users.column.lastLogin'),
      width: 170,
      hideBelow: 'md',
      cell: (m) => (
        <span className="text-muted text-[13px]">
          {m.lastLoginAt ? formatRelative(m.lastLoginAt) : t('common.never')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('users.column.actions')}</span>,
      width: 56,
      align: 'right',
      cell: (m) => {
        const self = m.userId === currentUserId;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={t('users.action.menu', { name: m.name })} noTooltip>
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                icon={<UserRoundCog />}
                onSelect={() => {
                  setRole(m.role);
                  setDialog({ kind: 'role', member: m });
                }}
              >
                {t('users.action.changeRole')}
              </DropdownMenuItem>
              {m.status === 'invited' ? (
                <DropdownMenuItem icon={<MailPlus />} onSelect={() => resend(m)}>
                  {t('users.action.resendInvite')}
                </DropdownMenuItem>
              ) : null}
              {viewerIsSuperadmin ? (
                m.isSuperadmin ? (
                  <DropdownMenuItem
                    icon={<ShieldMinus />}
                    disabled={self}
                    onSelect={() => revokeSuperadmin(m)}
                  >
                    {t('users.action.revokeSuperadmin')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    icon={<ShieldCheck />}
                    onSelect={() => setDialog({ kind: 'superadmin', member: m })}
                  >
                    {t('users.action.makeSuperadmin')}
                  </DropdownMenuItem>
                )
              ) : null}
              <DropdownMenuSeparator />
              {m.isActive ? (
                <DropdownMenuItem
                  icon={<UserRoundX />}
                  disabled={self}
                  onSelect={() => setDialog({ kind: 'deactivate', member: m })}
                >
                  {t('users.action.deactivate')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem icon={<UserRoundCheck />} onSelect={() => reactivate(m)}>
                  {t('users.action.reactivate')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                destructive
                icon={<UserRoundMinus />}
                disabled={self}
                onSelect={() => setDialog({ kind: 'remove', member: m })}
              >
                {t('users.action.remove', { site: siteName })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const member = dialog?.member;

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey="userId"
        caption={t('users.count', { count: rows.length })}
        emptyState={
          <EmptyState
            icon={<Users />}
            title={t('users.empty.title')}
            description={t('users.empty.description')}
            compact
          />
        }
      />

      <Dialog
        open={dialog?.kind === 'role'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('users.roleDialog.title', { name: member?.name ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (!member) return;
                run(() => changeRoleAction({ userId: member.userId, role }), t('users.roleDialog.saved'))
                  .then(() => setDialog(null))
                  .catch((err: unknown) =>
                    toast.error(err instanceof Error ? err.message : t('common.error.generic')),
                  );
              }}
            >
              {t('users.roleDialog.submit')}
            </Button>
          </>
        }
      >
        <FormField
          label={t('users.roleDialog.role')}
          htmlFor="member-role"
          help={t(`users.role.help.${role}`)}
        >
          <NativeSelect
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
            options={ROLES.map((r) => ({ value: r, label: t(`common.role.${r}`) }))}
          />
        </FormField>
      </Dialog>

      <ConfirmDialog
        open={dialog?.kind === 'deactivate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('users.confirm.deactivate.title', { name: member?.name ?? '' })}
        description={t('users.confirm.deactivate.description')}
        confirmLabel={t('users.action.deactivate')}
        destructive
        onConfirm={() =>
          member
            ? run(
                () => setUserActiveAction({ userId: member.userId, isActive: false }),
                t('users.toast.deactivated', { name: member.name }),
              )
            : Promise.resolve()
        }
      />

      <ConfirmDialog
        open={dialog?.kind === 'remove'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('users.confirm.remove.title', { name: member?.name ?? '', site: siteName })}
        description={t('users.confirm.remove.description')}
        confirmLabel={t('users.action.remove', { site: siteName })}
        destructive
        onConfirm={() =>
          member
            ? run(
                () => removeMemberAction({ userId: member.userId }),
                t('users.toast.removed', { name: member.name }),
              )
            : Promise.resolve()
        }
      />

      <ConfirmDialog
        open={dialog?.kind === 'superadmin'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('users.confirm.superadmin.title', { name: member?.name ?? '' })}
        description={t('users.confirm.superadmin.description')}
        confirmLabel={t('users.action.makeSuperadmin')}
        onConfirm={() =>
          member
            ? run(
                () => setSuperadminAction({ userId: member.userId, isSuperadmin: true }),
                t('users.toast.superadminGranted', { name: member.name }),
              )
            : Promise.resolve()
        }
      />
    </>
  );
}
