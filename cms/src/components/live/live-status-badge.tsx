'use client';
/**
 * Status badge for live blogs: draft (grey), live (red with pulse), ended (slate).
 */
import { Badge } from '@/components/ui/badge';
import type { LiveBlogStatus } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function LiveStatusBadge({ status, className }: { status: LiveBlogStatus; className?: string }) {
  const t = useT();
  if (status === 'live') {
    return (
      <Badge variant="danger" className={cn('gap-1.5', className)}>
        <span aria-hidden className="relative flex size-2">
          <span className="bg-danger absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden" />
          <span className="bg-danger relative inline-flex size-2 rounded-full" />
        </span>
        {t('live.status.live')}
      </Badge>
    );
  }
  if (status === 'ended')
    return (
      <Badge variant="muted" className={className}>
        {t('live.status.ended')}
      </Badge>
    );
  return (
    <Badge variant="outline" className={className}>
      {t('live.status.draft')}
    </Badge>
  );
}
