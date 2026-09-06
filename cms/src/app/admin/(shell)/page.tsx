/**
 * /admin — "Skrivebord". The newsroom's home: greeting, quick actions,
 * counters, my stories, the desk queue (reviewers), the next seven days,
 * the latest published stories, overdue deadlines, most read, unread
 * notifications and the activity feed. Server components only; data comes
 * from src/server/dashboard/queries.ts in one round trip.
 */
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Flame,
  Image as ImageIcon,
  LayoutTemplate,
  Plus,
  Send,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { greetingKey } from '@/components/admin/nav-helpers';
import { StatCard } from '@/components/admin/stat-card';
import { ActivityFeed } from '@/components/newsroom/dashboard/activity-feed';
import { ArticleMiniList } from '@/components/newsroom/dashboard/article-mini-list';
import { DashboardCard } from '@/components/newsroom/dashboard/dashboard-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatNumber, formatWeekdayDate, osloHour } from '@/components/ui/format';
import { PageHeader } from '@/components/ui/page-header';
import { adminPaths } from '@/config/routes';
import { formatDate, formatRelative } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { getAdminContext } from '@/server/auth/context';
import { getDashboardData } from '@/server/dashboard/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Skrivebord' };

export default async function DashboardPage() {
  const ctx = await getAdminContext();
  const now = new Date();
  const data = await getDashboardData(ctx, now);
  const firstName = ctx.user.name.trim().split(/\s+/)[0] ?? ctx.user.name;
  const dateLine = formatWeekdayDate(now);
  const articlesHref = adminPaths.articles();

  const quickActions = [
    ctx.can('article:create') && {
      key: 'new',
      href: adminPaths.newArticle(),
      label: t('dashboard.action.newArticle'),
      icon: <Plus />,
      primary: true,
    },
    ctx.can('media:upload') && {
      key: 'media',
      href: adminPaths.media(),
      label: t('dashboard.action.media'),
      icon: <ImageIcon />,
    },
    ctx.can('layout:edit') && {
      key: 'front',
      href: adminPaths.front(),
      label: t('dashboard.action.front'),
      icon: <LayoutTemplate />,
    },
    { key: 'plan', href: adminPaths.plan(), label: t('dashboard.action.plan'), icon: <CalendarDays /> },
  ].filter((a): a is Exclude<typeof a, false> => Boolean(a));

  const upcomingKindKey = {
    scheduled: 'dashboard.upcoming.scheduled',
    planned: 'dashboard.upcoming.planned',
    deadline: 'dashboard.upcoming.deadline',
  } as const;

  return (
    <>
      <PageHeader
        title={t(greetingKey(osloHour(now)), { name: firstName })}
        description={`${dateLine.charAt(0).toUpperCase()}${dateLine.slice(1)} · ${ctx.site.name}`}
        actions={
          <>
            {quickActions.map((a) => (
              <Button key={a.key} asChild variant={a.primary ? 'primary' : 'outline'}>
                <Link href={a.href}>
                  {a.icon}
                  {a.label}
                </Link>
              </Button>
            ))}
          </>
        }
      />

      <section aria-labelledby="dashboard-stats" className="mb-6">
        <h2 id="dashboard-stats" className="sr-only">
          {t('dashboard.stats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label={t('dashboard.stat.publishedToday')}
            value={data.stats.publishedToday}
            tone="success"
            icon={<Send />}
            href={`${articlesHref}?status=published`}
            hint={t('dashboard.stat.thisWeek', { count: data.stats.publishedThisWeek })}
          />
          <StatCard
            label={t('common.status.draft')}
            value={data.stats.drafts}
            tone="muted"
            icon={<FileText />}
            href={`${articlesHref}?status=draft`}
            hint={t('dashboard.stat.hint')}
          />
          <StatCard
            label={t('dashboard.stat.inReview')}
            value={data.stats.inReview}
            tone="warning"
            icon={<Eye />}
            href={`${articlesHref}?status=in_review`}
            hint={t('dashboard.stat.hint')}
          />
          <StatCard
            label={t('common.status.approved')}
            value={data.stats.approved}
            tone="info"
            icon={<CheckCircle2 />}
            href={`${articlesHref}?status=approved`}
            hint={t('dashboard.stat.hint')}
          />
          <StatCard
            label={t('dashboard.stat.overdue')}
            value={data.stats.overdue}
            tone={data.stats.overdue > 0 ? 'danger' : 'muted'}
            icon={<AlertTriangle />}
            href={adminPaths.plan()}
            hint={t('dashboard.stat.overdueHint')}
            valueClassName={data.stats.overdue > 0 ? 'text-danger' : undefined}
          />
          <StatCard
            label={t('dashboard.stat.views')}
            value={data.stats.viewsLast7Days}
            tone="default"
            icon={<TrendingUp />}
            hint={t('dashboard.stat.viewsHint')}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid content-start gap-4 xl:col-span-2">
          <DashboardCard
            title={t('dashboard.mine.title')}
            description={t('dashboard.mine.description')}
            icon={<FileText />}
            count={data.myArticles.length}
            href={`${articlesHref}?status=mine`}
            linkLabel={t('dashboard.seeAll')}
          >
            <ArticleMiniList
              items={data.myArticles}
              now={now}
              meta="updated"
              emptyTitle={t('dashboard.mine.empty')}
              emptyDescription={t('dashboard.mine.emptyDescription')}
              emptyAction={
                ctx.can('article:create') ? (
                  <Button asChild size="sm">
                    <Link href={adminPaths.newArticle()}>
                      <Plus />
                      {t('dashboard.action.newArticle')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </DashboardCard>

          {data.reviewQueue ? (
            <DashboardCard
              title={t('dashboard.review.title')}
              description={t('dashboard.review.description')}
              icon={<Eye />}
              count={data.reviewQueue.length}
              href={`${articlesHref}?status=in_review`}
              linkLabel={t('dashboard.seeAll')}
            >
              <ArticleMiniList
                items={data.reviewQueue}
                now={now}
                meta="age"
                emptyTitle={t('dashboard.review.empty')}
                emptyDescription={t('dashboard.review.emptyDescription')}
              />
            </DashboardCard>
          ) : null}

          <DashboardCard
            title={t('dashboard.upcoming.title')}
            description={t('dashboard.upcoming.description')}
            icon={<CalendarDays />}
            count={data.upcoming.length}
            href={adminPaths.plan()}
            linkLabel={t('dashboard.upcoming.openPlan')}
          >
            {data.upcoming.length === 0 ? (
              <EmptyState
                compact
                title={t('dashboard.upcoming.empty')}
                description={t('dashboard.upcoming.emptyDescription')}
              />
            ) : (
              <ul className="divide-border divide-y" role="list">
                {data.upcoming.map((u) => (
                  <li key={`${u.id}-${u.kind}`} className="flex items-start gap-3 px-5 py-2.5">
                    <div className="w-24 shrink-0">
                      <p className="text-text text-sm font-medium tabular-nums">
                        {formatDate(u.at, 'datetime')}
                      </p>
                      <p className="text-subtle text-xs">{formatRelative(u.at, now)}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={adminPaths.article(u.id)}
                        className="focus-visible:outline-ring block truncate text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {u.title.trim() || t('dashboard.untitled')}
                      </Link>
                      <p className="text-muted text-xs">
                        {[u.sectionName, u.assignedToName ?? t('dashboard.unassigned')]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Badge
                      variant={u.kind === 'scheduled' ? 'info' : u.kind === 'deadline' ? 'warning' : 'muted'}
                    >
                      {t(upcomingKindKey[u.kind])}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title={t('dashboard.recent.title')}
            icon={<Send />}
            href={`${articlesHref}?status=published`}
            linkLabel={t('dashboard.seeAll')}
          >
            <ArticleMiniList
              items={data.recentlyPublished}
              now={now}
              meta="published"
              showStatus={false}
              emptyTitle={t('dashboard.recent.empty')}
            />
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard
            title={t('dashboard.overdue.title')}
            description={t('dashboard.overdue.description')}
            icon={<AlertTriangle />}
            count={data.overdue.length}
            href={adminPaths.plan()}
            linkLabel={t('dashboard.upcoming.openPlan')}
          >
            <ArticleMiniList
              items={data.overdue}
              now={now}
              meta="deadline"
              emptyTitle={t('dashboard.overdue.empty')}
            />
          </DashboardCard>

          <DashboardCard
            title={t('dashboard.mostRead.title')}
            description={t('dashboard.mostRead.description')}
            icon={<Flame />}
          >
            {data.mostRead.length === 0 ? (
              <EmptyState compact title={t('dashboard.mostRead.empty')} />
            ) : (
              <ol className="divide-border divide-y" role="list">
                {data.mostRead.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2">
                    <span className="text-subtle w-4 text-right text-xs tabular-nums" aria-hidden>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={adminPaths.article(m.id)}
                        className="focus-visible:outline-ring block truncate text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {m.title.trim() || t('dashboard.untitled')}
                      </Link>
                      {m.sectionName ? <p className="text-subtle text-xs">{m.sectionName}</p> : null}
                    </div>
                    <span className="text-muted text-sm tabular-nums">
                      {t('dashboard.mostRead.views', { count: formatNumber(m.views) })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </DashboardCard>

          <DashboardCard
            title={t('dashboard.notifications.title')}
            icon={<Bell />}
            count={data.unreadCount}
            href={adminPaths.notifications()}
            linkLabel={t('dashboard.seeAll')}
          >
            {data.unreadNotifications.length === 0 ? (
              <EmptyState compact title={t('dashboard.notifications.empty')} />
            ) : (
              <ul className="divide-border divide-y" role="list">
                {data.unreadNotifications.map((n) => (
                  <li key={n.id} className="px-5 py-2">
                    {n.link ? (
                      <Link
                        href={n.link}
                        className="focus-visible:outline-ring block truncate text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {n.title}
                      </Link>
                    ) : (
                      <p className="truncate text-sm font-medium">{n.title}</p>
                    )}
                    <p className="text-subtle flex items-center gap-1 text-xs">
                      <Clock className="size-3" aria-hidden />
                      <time dateTime={n.createdAt.toISOString()}>{formatRelative(n.createdAt, now)}</time>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          {ctx.can('article:review') || ctx.can('audit:view') ? (
            <DashboardCard
              title={t('dashboard.activity.title')}
              icon={<Clock />}
              href={ctx.can('audit:view') ? adminPaths.audit() : undefined}
              linkLabel={ctx.can('audit:view') ? t('dashboard.activity.log') : undefined}
            >
              <ActivityFeed items={data.activity} now={now} />
            </DashboardCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
