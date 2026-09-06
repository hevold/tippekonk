/**
 * ActivityFeed — the last audit entries as sentences with a glyph per
 * action family and a relative timestamp. Server-safe.
 */
import {
  Blocks,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Radio,
  Send,
  Settings,
  Sparkles,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '@/components/ui/empty-state';
import { adminPaths } from '@/config/routes';
import { formatDate, formatRelative } from '@/lib/dates';
import { t } from '@/lib/i18n';
import type { ActivityIcon, ActivityItem } from '@/server/dashboard/queries';

const ICONS: Record<ActivityIcon, ReactNode> = {
  article: <FileText />,
  publish: <Send />,
  media: <ImageIcon />,
  taxonomy: <Blocks />,
  user: <UserRound />,
  settings: <Settings />,
  layout: <LayoutTemplate />,
  live: <Radio />,
  other: <Sparkles />,
};

export function ActivityFeed({ items, now }: { items: ActivityItem[]; now: Date }) {
  if (items.length === 0) {
    return <EmptyState compact title={t('dashboard.activity.empty')} />;
  }
  return (
    <ol className="divide-border divide-y" role="list">
      {items.map((item) => {
        const link = item.entityType === 'article' && item.entityId ? adminPaths.article(item.entityId) : null;
        return (
          <li key={item.id} className="flex items-start gap-3 px-5 py-2">
            <span className="bg-surface-2 text-muted mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5" aria-hidden>
              {ICONS[item.icon]}
            </span>
            <div className="min-w-0 flex-1 text-sm leading-5">
              {link ? (
                <Link href={link} className="focus-visible:outline-ring rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
                  {item.text}
                </Link>
              ) : (
                <span>{item.text}</span>
              )}
              <p className="text-subtle text-xs">
                <time dateTime={item.createdAt.toISOString()} title={formatDate(item.createdAt, 'datetime')}>
                  {formatRelative(item.createdAt, now)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
