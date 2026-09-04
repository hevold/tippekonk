/**
 * Dashboard ("Skrivebord"): greeting by Oslo time, article counts by status,
 * the latest updated articles and permission-gated quick actions. Kept
 * self-contained (simple db queries) so the shell works before the newsroom
 * area's richer dashboard replaces it.
 */
import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm';
import {
  CalendarClock,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Plus,
  Send,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { greetingKey } from '@/components/admin/nav-helpers';
import { StatCard, type StatTone } from '@/components/admin/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelative, formatWeekdayDate, osloHour } from '@/components/ui/format';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminPaths } from '@/config/routes';
import { db } from '@/db';
import { articles, sections, users, type ArticleStatus } from '@/db/schema';
import { t } from '@/lib/i18n';
// INTEGRATION: provided by the auth area (SPEC 4.2).
import { getAdminContext } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Skrivebord' };

const STAT_ORDER: { status: ArticleStatus; tone: StatTone; icon: React.ReactNode }[] = [
  { status: 'draft', tone: 'muted', icon: <FileText /> },
  { status: 'in_review', tone: 'warning', icon: <Eye /> },
  { status: 'approved', tone: 'info', icon: <CheckCircle2 /> },
  { status: 'scheduled', tone: 'default', icon: <CalendarClock /> },
  { status: 'published', tone: 'success', icon: <Send /> },
];

const LATEST_LIMIT = 8;

export default async function DashboardPage() {
  const ctx = await getAdminContext();
  const now = new Date();

  // Contributors only see their own articles; everyone else sees the whole site.
  const scope: SQL | undefined = ctx.can('article:edit_any')
    ? undefined
    : eq(articles.createdBy, ctx.user.id);
  const base = and(eq(articles.siteId, ctx.site.id), isNull(articles.deletedAt), scope);

  const [countRows, latest] = await Promise.all([
    db
      .select({ status: articles.status, value: count() })
      .from(articles)
      .where(base)
      .groupBy(articles.status),
    db
      .select({
        id: articles.id,
        title: articles.title,
        status: articles.status,
        updatedAt: articles.updatedAt,
        sectionName: sections.name,
        updatedBy: users.name,
      })
      .from(articles)
      .leftJoin(sections, eq(articles.sectionId, sections.id))
      .leftJoin(users, eq(articles.updatedBy, users.id))
      .where(base)
      .orderBy(desc(articles.updatedAt))
      .limit(LATEST_LIMIT),
  ]);

  const counts = new Map<ArticleStatus, number>(countRows.map((r) => [r.status, Number(r.value)]));
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const firstName = ctx.user.name.trim().split(/\s+/)[0] ?? ctx.user.name;
  const dateLine = formatWeekdayDate(now);

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
  ].filter((a): a is Exclude<typeof a, false> => Boolean(a));

  return (
    <>
      <PageHeader
        title={t(greetingKey(osloHour(now)), { name: firstName })}
        description={`${dateLine.charAt(0).toUpperCase()}${dateLine.slice(1)} · ${ctx.site.name}`}
        actions={
          quickActions.length > 0 ? (
            <>
              {quickActions.map((a) => (
                <Button key={a.key} asChild variant={a.primary ? 'primary' : 'outline'} size="md">
                  <Link href={a.href}>
                    {a.icon}
                    {a.label}
                  </Link>
                </Button>
              ))}
            </>
          ) : undefined
        }
      />

      <section aria-labelledby="dashboard-stats" className="mb-6">
        <h2 id="dashboard-stats" className="sr-only">
          {t('dashboard.stats')}
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {STAT_ORDER.map(({ status, tone, icon }) => (
            <StatCard
              key={status}
              label={t(`common.status.${status}`)}
              value={counts.get(status) ?? 0}
              tone={tone}
              icon={icon}
              href={`${adminPaths.articles()}?status=${status}`}
              hint={t('dashboard.stat.hint')}
            />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{t('dashboard.latest.title')}</CardTitle>
            <CardDescription>{t('dashboard.latest.description', { count: total })}</CardDescription>
          </div>
          <Button asChild variant="link" size="sm">
            <Link href={adminPaths.articles()}>{t('dashboard.latest.all')}</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {latest.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title={t('dashboard.empty.title')}
              description={t('dashboard.empty.description')}
              action={
                ctx.can('article:create') ? (
                  <Button asChild>
                    <Link href={adminPaths.newArticle()}>
                      <Plus />
                      {t('dashboard.action.newArticle')}
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table className="border-0 [&_tr:last-child]:border-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.title')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('common.section')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('common.updated')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-[28rem]">
                      <Link
                        href={adminPaths.article(a.id)}
                        className="focus-visible:outline-ring block truncate font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {a.title.trim() || t('dashboard.untitled')}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted hidden md:table-cell">{a.sectionName ?? '–'}</TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-muted hidden whitespace-nowrap sm:table-cell">
                      <time dateTime={a.updatedAt.toISOString()}>{formatRelative(a.updatedAt, now)}</time>
                      {a.updatedBy ? <span className="text-subtle"> · {a.updatedBy}</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
