'use client';
/**
 * RevisionsCard ("Versjoner") — revision count, the latest revision and a
 * link to the full versions page with diff and restore.
 */
import { History } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatRelative } from '@/components/ui/format';
import { adminPaths } from '@/config/routes';
import { useT } from '@/lib/i18n/client';
import type { RevisionSummary } from '@/server/articles/revisions';

export type RevisionsCardProps = {
  articleId: string;
  count: number;
  latest: RevisionSummary | null;
};

export function RevisionsCard({ articleId, count, latest }: RevisionsCardProps) {
  const t = useT();
  return (
    <div className="grid gap-3">
      <p className="text-muted text-sm">{t('articles.revisions.count', { count })}</p>
      {latest ? (
        <p className="text-muted text-xs">
          {t('articles.revisions.latest', {
            version: latest.version,
            kind: t(`articles.revisions.kind.${latest.kind}`),
            who: latest.createdBy?.name ?? t('common.unknown'),
            when: formatRelative(latest.createdAt),
          })}
        </p>
      ) : null}
      <Button asChild variant="outline" size="sm" leftIcon={<History />}>
        <Link href={adminPaths.articleRevisions(articleId)}>{t('articles.revisions.open')}</Link>
      </Button>
    </div>
  );
}
