/**
 * Kbd — keyboard key cap, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'bg-surface-2 text-muted border-border inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1 font-sans text-[11px] font-medium',
        className,
      )}
      {...props}
    />
  );
}

/** Platform-aware modifier label: "⌘" on macOS, "Ctrl" elsewhere. Safe on the server (defaults to Ctrl). */
export function modKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl';
}
