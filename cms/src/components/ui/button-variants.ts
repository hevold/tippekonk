/**
 * Button variant map (class-variance-authority). Kept in a .ts file so it can
 * be unit-tested in the node environment and shared by Button/IconButton and
 * link-styled elements (e.g. `<Link className={buttonVariants({ variant: 'outline' })}>`).
 */
import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium',
    'transition-colors duration-100 select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover',
        secondary: 'bg-surface-2 text-text hover:bg-surface-3',
        outline: 'border border-border bg-surface text-text shadow-xs hover:bg-surface-2',
        ghost: 'text-text hover:bg-surface-2',
        danger: 'bg-danger text-white shadow-xs hover:bg-danger-hover',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-[13px] [&_svg]:size-3.5',
        md: 'h-8 px-3 text-sm [&_svg]:size-4',
        lg: 'h-10 px-4 text-[15px] [&_svg]:size-4',
        icon: 'size-8 p-0 [&_svg]:size-4',
      },
    },
    compoundVariants: [
      { variant: 'link', size: 'sm', className: 'h-auto px-0' },
      { variant: 'link', size: 'md', className: 'h-auto px-0' },
      { variant: 'link', size: 'lg', className: 'h-auto px-0' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
export type ButtonVariant = NonNullable<ButtonVariantProps['variant']>;
export type ButtonSize = NonNullable<ButtonVariantProps['size']>;

export const BUTTON_VARIANTS: ButtonVariant[] = [
  'primary',
  'secondary',
  'outline',
  'ghost',
  'danger',
  'link',
];
export const BUTTON_SIZES: ButtonSize[] = ['sm', 'md', 'lg', 'icon'];

/** Icon-only sizes: square boxes matching the text button heights. */
export const iconButtonSize: Record<ButtonSize, string> = {
  sm: 'size-7 p-0 [&_svg]:size-3.5',
  md: 'size-8 p-0 [&_svg]:size-4',
  lg: 'size-10 p-0 [&_svg]:size-5',
  icon: 'size-8 p-0 [&_svg]:size-4',
};
