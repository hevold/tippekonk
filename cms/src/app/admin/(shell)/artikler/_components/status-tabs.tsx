/**
 * StatusTabs — the "Alle · Mine · Utkast · …" strip above the article list.
 * Server-safe links that keep every other filter in the URL; counts come
 * from countArticlesByTab().
 */
import Link from 'next/link';

import { listHref, withQuery, type ListQuery } from '@/components/newsroom/list-url';
import { formatNumber } from '@/components/ui/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { LIST_TABS, type ListTab, type ListTabCounts } from '@/server/articles/list';

export type StatusTabsProps = {
  query: ListQuery;
  active: ListTab;
  counts: ListTabCounts;
};

const LABEL_KEY: Record<ListTab, string> = {
  all: 'list.tab.all',
  mine: 'list.tab.mine',
  draft: 'common.status.draft',
  in_review: 'list.tab.in_review',
  approved: 'common.status.approved',
  scheduled: 'common.status.scheduled',
  published: 'common.status.published',
  unpublished: 'common.status.unpublished',
  archived: 'common.status.archived',
  trash: 'common.status.trash',
};

export function StatusTabs({ query, active, counts }: StatusTabsProps) {
  return (
    <nav
      aria-label={t('list.tabs')}
      className="border-border -mx-1 mb-4 flex scrollbar-none items-end gap-1 overflow-x-auto border-b px-1"
    >
      {LIST_TABS.map((tab) => {
        const isActive = tab === active;
        const href = listHref(withQuery(query, { status: tab === 'all' ? '' : tab }));
        return (
          <Link
            key={tab}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'text-muted relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors',
              'hover:text-text focus-visible:outline-ring rounded-t-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
              isActive && 'border-primary text-text',
            )}
          >
            {t(LABEL_KEY[tab])}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums',
                isActive ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-muted',
              )}
            >
              {formatNumber(counts[tab])}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
