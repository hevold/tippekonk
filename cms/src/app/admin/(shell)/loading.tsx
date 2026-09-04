/**
 * Instant loading state for admin pages: a page-header skeleton, a row of
 * stat cards and a table outline. Announced politely to assistive tech.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';

export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy className="flex flex-col gap-6">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="border-border bg-surface rounded-lg border">
        <div className="border-border flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-border flex items-center gap-4 border-b px-4 py-3 last:border-0">
            <Skeleton className="h-4 w-[45%]" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="ml-auto hidden h-4 w-28 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
