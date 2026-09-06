/**
 * DashboardCard — a titled panel on the Skrivebord with an optional
 * "Se alle" link and a count. Server-safe.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type DashboardCardProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  href?: string;
  linkLabel?: ReactNode;
  count?: number;
  className?: string;
  /** Remove body padding for lists that draw their own rows. */
  flush?: boolean;
  children: ReactNode;
};

export function DashboardCard({ title, description, icon, href, linkLabel, count, className, flush = true, children }: DashboardCardProps) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-[15px]">
            {icon ? <span className="text-muted [&_svg]:size-4" aria-hidden>{icon}</span> : null}
            {title}
            {typeof count === 'number' ? (
              <span className="bg-surface-2 text-muted rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums">
                {count}
              </span>
            ) : null}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {href && linkLabel ? (
          <Link
            href={href}
            className="text-primary focus-visible:outline-ring shrink-0 rounded-sm text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {linkLabel}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className={cn('flex-1', flush && 'px-0 pb-0')}>{children}</CardContent>
    </Card>
  );
}
