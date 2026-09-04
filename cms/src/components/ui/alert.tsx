/**
 * Alert — inline message box. Variants: info (default) | success | warning | danger.
 * Use role="alert" (via `live`) only for messages that appear dynamically.
 */
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export type AlertProps = Omit<ComponentProps<'div'>, 'title'> & {
  variant?: AlertVariant;
  title?: ReactNode;
  /** Announce to assistive tech when rendered (role="alert"). */
  live?: boolean;
  icon?: ReactNode | false;
  /** Right-aligned actions. */
  actions?: ReactNode;
};

const variantClass: Record<AlertVariant, string> = {
  info: 'bg-info-soft border-info/20 text-text [&>svg]:text-info',
  success: 'bg-success-soft border-success/20 text-text [&>svg]:text-success',
  warning: 'bg-warning-soft border-warning/25 text-text [&>svg]:text-warning',
  danger: 'bg-danger-soft border-danger/25 text-text [&>svg]:text-danger',
};

const defaultIcon: Record<AlertVariant, ReactNode> = {
  info: <Info aria-hidden />,
  success: <CircleCheck aria-hidden />,
  warning: <TriangleAlert aria-hidden />,
  danger: <CircleAlert aria-hidden />,
};

export function Alert({
  variant = 'info',
  title,
  live,
  icon,
  actions,
  className,
  children,
  ...props
}: AlertProps) {
  return (
    <div
      role={live ? 'alert' : undefined}
      className={cn(
        'relative flex w-full gap-3 rounded-md border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        variantClass[variant],
        className,
      )}
      {...props}
    >
      {icon === false ? null : (icon ?? defaultIcon[variant])}
      <div className="min-w-0 flex-1 leading-5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'text-muted mt-0.5')}>{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-start gap-2">{actions}</div> : null}
    </div>
  );
}
