/**
 * PlanCalendar — server-rendered month/week grid and the list alternative.
 * Days are Oslo calendar days (ISO keys); each cell shows the day's events
 * as <PlanEventChip>s and, for users who may create, a "+" that opens the
 * create dialog with that day prefilled.
 */
import { CalendarDays } from 'lucide-react';

import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, fromOsloParts } from '@/lib/dates';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { PlanRange } from '@/server/plan/queries';

import { PlanCreateDialog } from './plan-create-dialog';
import { PlanEventChip } from './plan-event-chip';
import type { PlanEventDto, PlanOption, PlanPermissions } from './types';

export type PlanCalendarProps = {
  range: PlanRange;
  eventsByDay: Record<string, PlanEventDto[]>;
  perm: PlanPermissions;
  members: PlanOption[];
  sections: PlanOption[];
  now: Date;
};

const WEEKDAY_KEYS = [
  'plan.weekday.mon',
  'plan.weekday.tue',
  'plan.weekday.wed',
  'plan.weekday.thu',
  'plan.weekday.fri',
  'plan.weekday.sat',
  'plan.weekday.sun',
];

/** 09:00 Oslo on an ISO day, as the default planned instant for new stories. */
function defaultPlannedAt(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return fromOsloParts({ year: y!, month: m!, day: d!, hour: 9 }).toISOString();
}

function dayNumber(day: string): number {
  return Number(day.slice(8, 10));
}

function inPeriod(day: string, range: PlanRange): boolean {
  const fromKey = formatDate(range.from, 'iso-date');
  const toKey = formatDate(range.to, 'iso-date');
  return day >= fromKey && day < toKey;
}

export function PlanCalendar({ range, eventsByDay, perm, members, sections, now }: PlanCalendarProps) {
  const weeks: string[][] = [];
  for (let i = 0; i < range.days.length; i += 7) weeks.push(range.days.slice(i, i + 7));
  const isWeek = range.view === 'week';

  return (
    <div
      className="border-border bg-surface overflow-x-auto rounded-lg border"
      role="region"
      aria-label={range.label}
    >
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">{t('plan.calendarCaption', { label: range.label })}</caption>
        <thead>
          <tr className="border-border border-b">
            {WEEKDAY_KEYS.map((key, i) => (
              <th
                key={key}
                scope="col"
                className={cn(
                  'text-muted px-2 py-2 text-left text-xs font-medium',
                  i >= 5 && 'bg-surface-2/60',
                )}
              >
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi} className="border-border border-b last:border-b-0">
              {week.map((day, di) => {
                const events = eventsByDay[day] ?? [];
                const today = day === range.today;
                const muted = !inPeriod(day, range);
                return (
                  <td
                    key={day}
                    className={cn(
                      'group border-border border-r p-1.5 align-top last:border-r-0',
                      isWeek ? 'h-[28rem] min-h-[24rem]' : 'h-32',
                      di >= 5 && 'bg-surface-2/40',
                      muted && 'bg-surface-2/70',
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                          today ? 'bg-primary text-primary-foreground' : muted ? 'text-subtle' : 'text-text',
                        )}
                        aria-current={today ? 'date' : undefined}
                      >
                        <time dateTime={day}>{dayNumber(day)}</time>
                        <span className="sr-only">{formatDate(`${day}T12:00:00Z`, 'weekday')}</span>
                      </span>
                      {perm.create ? (
                        <PlanCreateDialog
                          compact
                          members={members}
                          sections={sections}
                          defaultPlannedAt={defaultPlannedAt(day)}
                          currentUserId={perm.userId}
                        />
                      ) : null}
                    </div>
                    {events.length > 0 ? (
                      <ul className="grid gap-0.5" role="list">
                        {events.map((e) => (
                          <li key={`${e.article.id}-${e.kind}`}>
                            <PlanEventChip
                              article={e.article}
                              kind={e.kind}
                              at={e.at}
                              perm={perm}
                              members={members}
                              now={now}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type PlanListProps = Omit<PlanCalendarProps, 'range'> & { days: string[] };

/** Chronological list of the same events, one section per day. */
export function PlanList({ days, eventsByDay, perm, members, now }: PlanListProps) {
  const withEvents = days.filter((d) => (eventsByDay[d] ?? []).length > 0);
  if (withEvents.length === 0) {
    return (
      <div className="border-border bg-surface rounded-lg border">
        <EmptyState
          icon={<CalendarDays />}
          title={t('plan.empty.title')}
          description={t('plan.empty.description')}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {withEvents.map((day) => (
        <section
          key={day}
          aria-labelledby={`plan-day-${day}`}
          className="border-border bg-surface overflow-hidden rounded-lg border"
        >
          <h3
            id={`plan-day-${day}`}
            className="border-border bg-surface-2/60 border-b px-4 py-2 text-sm font-semibold capitalize"
          >
            {formatDate(`${day}T12:00:00Z`, 'weekday')}
          </h3>
          <ul className="divide-border divide-y" role="list">
            {(eventsByDay[day] ?? []).map((e) => (
              <li key={`${e.article.id}-${e.kind}`}>
                <PlanEventChip
                  article={e.article}
                  kind={e.kind}
                  at={e.at}
                  perm={perm}
                  members={members}
                  variant="row"
                  now={now}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
