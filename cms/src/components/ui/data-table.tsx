'use client';
/**
 * DataTable — column-driven table with optional sorting, sticky header,
 * clickable rows and an empty state.
 *
 *   <DataTable
 *     columns={[
 *       { key: 'title', header: 'Tittel', sortable: true, cell: (a) => <Link …>{a.title}</Link> },
 *       { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} />, width: 120 },
 *     ]}
 *     rows={articles}
 *     rowKey={(a) => a.id}
 *     sort={{ key: 'updatedAt', dir: 'desc' }}
 *     onSortChange={setSort}
 *     emptyState={<EmptyState title="Ingen saker ennå" />}
 *   />
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { Skeleton } from './skeleton';
import { TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from './table';

export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir };

export type ColumnDef<T> = {
  key: string;
  header: ReactNode;
  cell?: (row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  /** Fixed width (px number or CSS length). */
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  /** Hide below a breakpoint. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
};

export type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  rows: T[];
  rowKey: keyof T | ((row: T) => string);
  onRowClick?: (row: T, event: MouseEvent | KeyboardEvent) => void;
  emptyState?: ReactNode;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  stickyHeader?: boolean;
  /** Render skeleton rows instead of data. */
  loading?: boolean;
  loadingRows?: number;
  /** Row-level classes (e.g. highlight). */
  rowClassName?: (row: T) => string | undefined;
  /** Mark rows as selected (adds data-state="selected"). */
  isSelected?: (row: T) => boolean;
  caption?: string;
  className?: string;
  /** Compact rows for very dense lists. */
  dense?: boolean;
};

const hideBelowClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

const alignClass = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

function defaultCell<T>(row: T, key: string): ReactNode {
  const value = (row as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toLocaleString('nb-NO');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyState,
  sort,
  onSortChange,
  stickyHeader = false,
  loading = false,
  loadingRows = 6,
  rowClassName,
  isSelected,
  caption,
  className,
  dense = false,
}: DataTableProps<T>) {
  const t = useT();
  const getKey = (row: T, index: number): string => {
    if (typeof rowKey === 'function') return rowKey(row);
    const v = row[rowKey];
    return v === undefined || v === null ? String(index) : String(v);
  };

  function toggleSort(col: ColumnDef<T>) {
    if (!col.sortable || !onSortChange) return;
    const dir: SortDir = sort?.key === col.key && sort.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: col.key, dir });
  }

  const interactive = Boolean(onRowClick);

  return (
    <div
      className={cn(
        'border-border bg-surface relative w-full overflow-auto rounded-lg border',
        stickyHeader && 'max-h-[70vh]',
        className,
      )}
    >
      <table className="w-full caption-bottom text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader className={cn(stickyHeader && 'sticky top-0 z-10 shadow-[0_1px_0_0_var(--border)]')}>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined;
              const SortIcon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead
                  key={col.key}
                  aria-sort={col.sortable ? (ariaSort ?? 'none') : undefined}
                  style={col.width !== undefined ? { width: col.width } : undefined}
                  className={cn(
                    alignClass[col.align ?? 'left'],
                    col.hideBelow && hideBelowClass[col.hideBelow],
                    col.headerClassName,
                  )}
                >
                  {col.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={cn(
                        'hover:text-text -mx-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors',
                        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
                        active && 'text-text',
                      )}
                    >
                      {col.header}
                      <SortIcon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
                      <span className="sr-only">
                        {active
                          ? sort.dir === 'asc'
                            ? t('ui.table.sortedAsc')
                            : t('ui.table.sortedDesc')
                          : t('ui.table.sort')}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: loadingRows }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(dense && 'py-1.5', col.hideBelow && hideBelowClass[col.hideBelow])}
                    >
                      <Skeleton className="h-4 w-[60%]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : null}
          {!loading && rows.length === 0 ? (
            <TableEmpty colSpan={columns.length}>{emptyState ?? t('ui.table.empty')}</TableEmpty>
          ) : null}
          {!loading
            ? rows.map((row, index) => {
                const selected = isSelected?.(row) ?? false;
                return (
                  <TableRow
                    key={getKey(row, index)}
                    data-state={selected ? 'selected' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    onClick={interactive ? (e) => onRowClick?.(row, e) : undefined}
                    onKeyDown={
                      interactive
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onRowClick?.(row, e);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      interactive &&
                        'focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                      rowClassName?.(row),
                    )}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          dense && 'py-1.5',
                          alignClass[col.align ?? 'left'],
                          col.hideBelow && hideBelowClass[col.hideBelow],
                          col.className,
                        )}
                      >
                        {col.cell ? col.cell(row, index) : defaultCell(row, col.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            : null}
        </TableBody>
      </table>
    </div>
  );
}
