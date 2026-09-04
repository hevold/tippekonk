/**
 * EmptyState — explains that there is nothing here and what to do next.
 *
 *   <EmptyState icon={<FileText />} title="Ingen saker ennå" description="Opprett den første."
 *     action={<Button asChild><Link href="/admin/artikler/ny">Ny sak</Link></Button>} />
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Smaller paddings for use inside cards and tables. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon ? (
        <div
          className="bg-surface-2 text-muted flex size-10 items-center justify-center rounded-lg [&_svg]:size-5"
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm">
        <p className="text-text text-[15px] font-semibold">{title}</p>
        {description ? <p className="text-muted mt-1 text-sm leading-5">{description}</p> : null}
      </div>
      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
