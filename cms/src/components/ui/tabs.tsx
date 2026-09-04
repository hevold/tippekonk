'use client';
/**
 * Tabs (Radix) plus LinkTabs for route-based tabs (settings sub-pages).
 * Both share the underline style.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

const listClass = 'border-border flex items-end gap-1 overflow-x-auto border-b scrollbar-none';
const triggerClass = cn(
  'text-muted relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors',
  'hover:text-text',
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring rounded-t-sm',
  '[&_svg]:size-4',
);
const activeClass = 'border-primary text-text';

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn(listClass, className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        triggerClass,
        'data-[state=active]:border-primary data-[state=active]:text-text',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('focus-visible:outline-ring pt-4 outline-none focus-visible:outline-2', className)}
      {...props}
    />
  );
}

export type LinkTabItem = {
  href: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Match when the pathname starts with href (default: exact for the first item, prefix for others). */
  exact?: boolean;
  /** Small counter or badge shown after the label. */
  count?: number | string;
};

export type LinkTabsProps = {
  items: LinkTabItem[];
  className?: string;
  'aria-label'?: string;
};

/** Route-based tabs: the active tab is derived from the current pathname. */
export function LinkTabs({ items, className, ...props }: LinkTabsProps) {
  const pathname = usePathname();
  // Prefer the longest matching href so /innstillinger and /innstillinger/tema do not both match.
  const active = items
    .filter((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav className={cn(listClass, className)} aria-label={props['aria-label']}>
      {items.map((item) => {
        const isActive = active?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(triggerClass, isActive && activeClass)}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span className="bg-surface-2 text-muted ml-1 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums">
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
