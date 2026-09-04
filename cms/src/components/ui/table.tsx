/**
 * Table primitives — dense 14px tables for admin lists. See <DataTable> for
 * the column-driven wrapper.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="border-border bg-surface relative w-full overflow-x-auto rounded-lg border">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-surface-2/60 [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return <tfoot className={cn('bg-surface-2/60 border-t font-medium', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-border hover:bg-surface-2/60 data-[state=selected]:bg-primary-soft border-b transition-colors',
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'text-muted h-9 px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap',
        '[&:has([role=checkbox])]:w-8 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn(
        'px-3 py-2 align-middle',
        '[&:has([role=checkbox])]:w-8 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('text-muted mt-3 text-sm', className)} {...props} />;
}

export type TableEmptyProps = ComponentProps<'td'> & { colSpan: number };

/** Full-width empty row. Put an <EmptyState> inside. */
export function TableEmpty({ className, colSpan, children, ...props }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('text-muted px-3 py-10 text-center text-sm', className)} {...props}>
        {children}
      </td>
    </tr>
  );
}
