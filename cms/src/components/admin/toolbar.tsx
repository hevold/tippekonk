/**
 * Toolbar — a compact action row (buttons, separators, counts) used above
 * tables and inside editors. Server-safe: it is just layout.
 *
 *   <Toolbar end={<Button>Ny sak</Button>}>
 *     <Button variant="outline" size="sm">Eksporter</Button>
 *     <ToolbarSeparator />
 *     <span className="text-muted text-sm">24 saker</span>
 *   </Toolbar>
 */
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ToolbarProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** Right-aligned content. */
  end?: ReactNode;
  /** Sticks below the topbar while scrolling. */
  sticky?: boolean;
  /** Draw a bottom border and background (e.g. editor toolbars). */
  bordered?: boolean;
  children?: ReactNode;
};

export function Toolbar({ end, sticky, bordered, className, children, ...props }: ToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5',
        bordered && 'bg-surface border-border rounded-md border px-2 py-1',
        sticky && 'bg-bg/90 top-topbar sticky z-20 py-2 backdrop-blur',
        className,
      )}
      {...props}
    >
      {children}
      {end ? <div className="ml-auto flex items-center gap-1.5">{end}</div> : null}
    </div>
  );
}

export function ToolbarSeparator({ className }: { className?: string }) {
  return <span aria-hidden className={cn('bg-border mx-1 h-5 w-px shrink-0', className)} />;
}
