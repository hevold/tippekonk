'use client';
/**
 * ArticleFlags — the small "Pluss", "Siste nytt" and "Annonsørinnhold"
 * badges shown next to titles in lists and calendars.
 */
import { Badge } from '@/components/ui/badge';
import type { ArticleAccess } from '@/db/schema';
import { useT } from '@/lib/i18n/client';

export type ArticleFlagsProps = {
  access: ArticleAccess;
  isBreaking: boolean;
  isSponsored: boolean;
  className?: string;
};

export function ArticleFlags({ access, isBreaking, isSponsored, className }: ArticleFlagsProps) {
  const t = useT();
  if (access !== 'plus' && !isBreaking && !isSponsored) return null;
  return (
    <span className={className ?? 'inline-flex items-center gap-1'}>
      {access === 'plus' ? <Badge variant="default">{t('common.plus')}</Badge> : null}
      {isBreaking ? <Badge variant="danger">{t('common.breaking')}</Badge> : null}
      {isSponsored ? <Badge variant="warning">{t('common.sponsored')}</Badge> : null}
    </span>
  );
}
