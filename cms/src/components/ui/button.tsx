'use client';
/**
 * Button and IconButton. Variants live in ./button-variants.ts.
 *
 *   <Button variant="primary" leftIcon={<Plus />} loading={pending}>Ny sak</Button>
 *   <Button asChild variant="outline"><Link href="/admin">Skrivebord</Link></Button>
 *   <IconButton label="Lukk"><X /></IconButton>
 */
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { buttonVariants, iconButtonSize, type ButtonVariantProps } from './button-variants';
import { Spinner } from './spinner';
import { Tooltip } from './tooltip';

export type ButtonProps = ComponentProps<'button'> &
  ButtonVariantProps & {
    /** Render the child element instead of a <button>, passing the classes down (e.g. a Link). */
    asChild?: boolean;
    /** Shows a spinner and disables the button; the label stays for stable width. */
    loading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), loading && 'relative text-transparent', className);
  if (asChild) {
    return (
      <Slot.Root className={classes} aria-disabled={disabled || undefined} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="text-text absolute inset-0 flex items-center justify-center" aria-hidden>
          <Spinner size="sm" className={variant === 'primary' || variant === 'danger' ? 'text-white' : undefined} />
        </span>
      ) : null}
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}

export type IconButtonProps = Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'asChild' | 'children'> & {
  /** Accessible name; also shown as a tooltip. */
  label: string;
  /** Hide the tooltip (the label is still applied as aria-label). */
  noTooltip?: boolean;
  children: ReactNode;
};

export function IconButton({
  label,
  noTooltip = false,
  className,
  variant = 'ghost',
  size = 'md',
  children,
  ...props
}: IconButtonProps) {
  const sizeKey = size ?? 'md';
  const button = (
    <Button
      variant={variant}
      size={sizeKey}
      aria-label={label}
      className={cn(iconButtonSize[sizeKey], className)}
      {...props}
    >
      {children}
    </Button>
  );
  if (noTooltip) return button;
  return <Tooltip content={label}>{button}</Tooltip>;
}
