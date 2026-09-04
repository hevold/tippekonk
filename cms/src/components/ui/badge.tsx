/**
 * Badge — small pill label. Variants: default | success | warning | danger | info | outline | muted.
 */
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

import { badgeVariants, type BadgeVariantProps } from './badge-variants';

export type BadgeProps = ComponentProps<'span'> & BadgeVariantProps;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
