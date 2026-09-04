/**
 * Card family — bordered surface with optional header/footer.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('bg-surface border-border text-text flex flex-col rounded-lg border shadow-xs', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-5 pt-4 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-[15px] leading-6 font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-muted text-sm leading-5', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-border mt-auto flex items-center gap-2 border-t px-5 py-3', className)}
      {...props}
    />
  );
}
