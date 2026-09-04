/**
 * ResponsiveHide — hides its children below (or above) a breakpoint using
 * Tailwind's responsive utilities, e.g. secondary table columns or button
 * labels on small screens. Server-safe.
 *
 *   <ResponsiveHide below="md">Sist oppdatert</ResponsiveHide>
 *   <ResponsiveHide above="lg" as="div">Kompakt visning</ResponsiveHide>
 */
import type { ComponentProps, ElementType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

const belowClass: Record<Breakpoint, string> = {
  sm: 'hidden sm:contents',
  md: 'hidden md:contents',
  lg: 'hidden lg:contents',
  xl: 'hidden xl:contents',
};

const aboveClass: Record<Breakpoint, string> = {
  sm: 'contents sm:hidden',
  md: 'contents md:hidden',
  lg: 'contents lg:hidden',
  xl: 'contents xl:hidden',
};

export type ResponsiveHideProps = Omit<ComponentProps<'span'>, 'children'> & {
  /** Hidden when the viewport is narrower than this breakpoint. */
  below?: Breakpoint;
  /** Hidden when the viewport is at least this breakpoint. */
  above?: Breakpoint;
  as?: ElementType;
  children: ReactNode;
};

export function ResponsiveHide({ below, above, as, className, children, ...props }: ResponsiveHideProps) {
  const Tag: ElementType = as ?? 'span';
  return (
    <Tag className={cn(below && belowClass[below], above && aboveClass[above], className)} {...props}>
      {children}
    </Tag>
  );
}
