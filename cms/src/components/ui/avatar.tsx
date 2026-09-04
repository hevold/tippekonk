'use client';
/**
 * Avatar — image with initials fallback (Radix Avatar). Colour is derived
 * from the name so the same person always gets the same tint.
 */
import { Avatar as AvatarPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

import { avatarTint, initials } from './avatar-helpers';

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClass = {
  xs: 'size-5 text-[9px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-12 text-base',
} as const;

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full align-middle select-none',
        sizeClass[size],
        className,
      )}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 300 : 0}
        className={cn('flex size-full items-center justify-center font-semibold tracking-wide', avatarTint(name))}
        aria-label={name}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
