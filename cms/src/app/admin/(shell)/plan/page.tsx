/**
 * /admin/plan — redaksjonsplanen. Month, week or list view of every story
 * with a planned date, deadline, scheduled slot or publish date, navigable
 * through ?view=&date= (Oslo calendar). A side panel lists what needs
 * attention: overdue deadlines, planned stories nobody owns, open stories
 * with no dates. Contributors only see their own stories.
 */
import { AlertTriangle, CalendarDays, CalendarOff, ChevronLeft, ChevronRight, UserRoundX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanCalendar, PlanList } from '@/components/newsroom/plan/plan-calendar';
import { PlanCreateDialog } from '@/components/newsroom/plan/plan-create-dialog';
import { PlanEventChip } from '@/components/newsroom/plan/plan-event-chip';
import { toPlanArticleDto, toPlanEventDto, type PlanEventDto, type PlanPermissions } from '@/components/newsroom/plan/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { listArticleFilterOptions } from '@/server/articles/list';
import { getAdminContext } from '@/server/auth/context';
import {
  eventsForRange,
  groupEventsByDay,
  listPlanArticles,
  listPlanAttention,
  parseIsoDate,
  planRange,
  type PlanArticle,
  type PlanView,
} from '@/server/plan/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Redaksjonsplan' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEWS: PlanView[] = ['month', 'week', 'list'];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function planHref(view: PlanView, date: string): string {
  const params = new URLSearchParams();
  if (view !== 'month') params.set('view', view);
  params.set('date', date);
  return `${adminPaths.plan()}?${params.toString()}`;
}

export default async function PlanPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getAdminContext();
  const sp = await searchParams;
  const now = new Date();
  const viewParam = first(sp.view);
  const view: PlanView = VIEWS.includes(viewParam as PlanView) ? (viewParam as PlanView) : 'month';
  const anchor = parseIsoDate(first(sp.date)) ?? now;
  const range = planRange(view, anchor, now);

  const [articles, attention, options] = await Promise.all([
    listPlanArticles(ctx, { from: range.gridFrom, to: range.gridTo }),
    listPlanAttention(ctx, now),
    listArticleFilterOptions(ctx.site.id),
  ]);
  const events = eventsForRange(articles, { from: range.gridFrom, to: range.gridTo });
  const eventsByDay: Record<string, PlanEventDto[]> = {};
  for (const [day, list] of groupEventsByDay(events)) eventsByDay[day] = list.map(toPlanEventDto);

  const perm: PlanPermissions = {
    userId: ctx.user.id,
    create: ctx.can('article:create'),
    editAny: ctx.can('article:edit_any'),
    editOwn: ctx.can('article:edit_own'),
  };
  const members = options.members;
  const sections = options.sections.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.parentId ? `– ${s.name}` : s.name }));
  const anchorKey = range.days[view === 'month' ? 7 : 0] ?? range.today;

  const attentionPanel = (
    title: string,
    icon: React.ReactNode,
    items: PlanArticle[],
    kind: 'deadline' | 'planned',
    empty: string,
  ) => (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <span className="text-muted [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        <CardTitle className="flex items-center gap-2 text-sm">
          {title}
          <span className="bg-surface-2 text-muted rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums">{items.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {items.length === 0 ? (
          <EmptyState compact title={empty} />
        ) : (
          <ul className="divide-border divide-y" role="list">
            {items.map((a) => {
              const at = kind === 'deadline' ? a.deadlineAt : (a.plannedAt ?? a.deadlineAt ?? a.updatedAt);
              return (
                <li key={a.id}>
                  <PlanEventChip
                    article={toPlanArticleDto(a)}
                    kind={kind === 'deadline' ? 'deadline' : 'planned'}
                    at={(at ?? a.updatedAt).toISOString()}
                    perm={perm}
                    members={members}
                    variant="row"
                    now={now}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader
        title={t('plan.title')}
        description={t('plan.description')}
        actions={perm.create ? <PlanCreateDialog members={members} sections={sections} currentUserId={ctx.user.id} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm" aria-label={t('plan.nav.previous')}>
            <Link href={planHref(view, range.previous)}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={planHref(view, range.today)}>{t('plan.nav.today')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" aria-label={t('plan.nav.next')}>
            <Link href={planHref(view, range.next)}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        </div>
        <h2 className="text-text ml-1 text-base font-semibold capitalize" aria-live="polite">
          {range.label}
        </h2>
        <nav aria-label={t('plan.viewSwitch')} className="bg-surface-2 ml-auto inline-flex rounded-md p-0.5">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={planHref(v, anchorKey)}
              aria-current={v === view ? 'page' : undefined}
              className={cn(
                'focus-visible:outline-ring inline-flex h-7 items-center rounded-[5px] px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                v === view ? 'bg-surface text-text shadow-xs' : 'text-muted hover:text-text',
              )}
            >
              {t(`plan.view.${v}`)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {view === 'list' ? (
            <PlanList days={range.days} eventsByDay={eventsByDay} perm={perm} members={members} sections={sections} now={now} />
          ) : (
            <PlanCalendar range={range} eventsByDay={eventsByDay} perm={perm} members={members} sections={sections} now={now} />
          )}
          <p className="text-subtle mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden /> {t('plan.legend.planned')}
            </span>
            <span>{t('plan.legend.status')}</span>
          </p>
        </div>
        <aside className="grid content-start gap-4" aria-label={t('plan.attention')}>
          {attentionPanel(t('plan.attention.overdue'), <AlertTriangle />, attention.overdue, 'deadline', t('plan.attention.overdueEmpty'))}
          {attentionPanel(t('plan.attention.unassigned'), <UserRoundX />, attention.unassigned, 'planned', t('plan.attention.unassignedEmpty'))}
          {attentionPanel(t('plan.attention.undated'), <CalendarOff />, attention.undated, 'planned', t('plan.attention.undatedEmpty'))}
        </aside>
      </div>
    </>
  );
}
