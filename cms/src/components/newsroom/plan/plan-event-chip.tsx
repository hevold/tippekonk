'use client';
/**
 * PlanEventChip — one story on a calendar day: coloured by status, with a
 * glyph for the event kind (planned/deadline/scheduled/published). Clicking
 * the chip opens a menu: open in the editor, move ("Flytt"), assign, remove
 * from the plan. Also used as a row in the list view and attention panel.
 */
import { CalendarClock, CalendarX2, Clock, ExternalLink, Flag, Move, Send, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { statusBadgeClass, statusDotClass } from '@/components/ui/badge-variants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime, formatTime } from '@/components/ui/format';
import { toast } from '@/components/ui/toast';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { updatePlanningAction } from '@/server/plan/actions';
import type { PlanEventKind } from '@/server/plan/queries';

import { PlanItemDialog } from './plan-item-dialog';
import { canPlan, type PlanArticleDto, type PlanOption, type PlanPermissions } from './types';

const KIND_ICON: Record<PlanEventKind, ReactNode> = {
  planned: <CalendarClock />,
  deadline: <Flag />,
  scheduled: <Clock />,
  published: <Send />,
};

export type PlanEventChipProps = {
  article: PlanArticleDto;
  kind: PlanEventKind;
  at: string;
  perm: PlanPermissions;
  members: PlanOption[];
  /** Row layout (list/attention) instead of the compact calendar chip. */
  variant?: 'chip' | 'row';
  now?: Date;
};

export function PlanEventChip({ article, kind, at, perm, members, variant = 'chip', now = new Date() }: PlanEventChipProps) {
  const t = useT();
  const [dialog, setDialog] = useState<null | 'plannedAt' | 'deadlineAt' | 'assignedTo'>(null);
  const [busy, setBusy] = useState(false);
  const editable = canPlan(perm, article);
  const title = article.title.trim() || t('plan.untitled');
  const time = formatTime(at);
  const overdue = kind === 'deadline' && new Date(at).getTime() < now.getTime() && ['draft', 'in_review', 'approved'].includes(article.status);

  async function removeFromPlan() {
    setBusy(true);
    const result = await updatePlanningAction({ id: article.id, plannedAt: null });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(t('plan.toast.removed'));
  }

  const label = (
    <>
      <span className={cn('shrink-0 [&_svg]:size-3.5', overdue && 'text-danger')} aria-hidden>
        {KIND_ICON[kind]}
      </span>
      <span className="text-subtle shrink-0 text-[11px] tabular-nums">{time}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </>
  );

  const trigger =
    variant === 'chip' ? (
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-1 rounded-sm px-1.5 py-0.5 text-left text-xs leading-5 transition-colors',
          'focus-visible:outline-ring hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1',
          statusBadgeClass[article.status],
          overdue && 'ring-danger/60 ring-1',
        )}
        title={`${title} · ${t(`plan.kind.${kind}`)} ${formatDateTime(at)}`}
        aria-label={`${title}, ${t(`plan.kind.${kind}`)} ${formatDateTime(at)}${overdue ? `, ${t('plan.overdue')}` : ''}`}
        disabled={busy}
      >
        {label}
      </button>
    ) : (
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
          'hover:bg-surface-2 focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
        )}
        aria-label={`${title}, ${t(`plan.kind.${kind}`)} ${formatDateTime(at)}`}
        disabled={busy}
      >
        <span className={cn('size-2 shrink-0 rounded-full', statusDotClass[article.status])} aria-hidden />
        <span className={cn('shrink-0 [&_svg]:size-4', overdue ? 'text-danger' : 'text-muted')} aria-hidden>
          {KIND_ICON[kind]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="text-muted block truncate text-xs">
            {[article.sectionName, article.assignedToName ?? t('plan.unassigned'), t(`plan.kind.${kind}`) + ' ' + formatDateTime(at)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
    );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[13rem]">
          <DropdownMenuLabel className="truncate">{title}</DropdownMenuLabel>
          <DropdownMenuItem asChild icon={<ExternalLink />}>
            <Link href={adminPaths.article(article.id)}>{t('plan.action.open')}</Link>
          </DropdownMenuItem>
          {editable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Move />} onSelect={() => setDialog('plannedAt')}>
                {t('plan.action.move')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Flag />} onSelect={() => setDialog('deadlineAt')}>
                {t('plan.action.deadline')}
              </DropdownMenuItem>
              <DropdownMenuItem icon={<UserRound />} onSelect={() => setDialog('assignedTo')}>
                {t('plan.action.assign')}
              </DropdownMenuItem>
              {article.plannedAt ? (
                <DropdownMenuItem icon={<CalendarX2 />} destructive onSelect={() => void removeFromPlan()}>
                  {t('plan.action.remove')}
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog ? (
        <PlanItemDialog open onOpenChange={(open) => !open && setDialog(null)} article={article} members={members} focus={dialog} />
      ) : null}
    </>
  );
}
