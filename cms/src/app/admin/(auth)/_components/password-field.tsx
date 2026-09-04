'use client';
/**
 * PasswordField — password input with a show/hide toggle, for the auth and
 * profile forms. Keeps the toggle outside the tab order of the form flow
 * (tabIndex -1) so keyboard users go straight to the next field.
 */
import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type PasswordFieldProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  showLabel?: string;
  hideLabel?: string;
};

export function PasswordField({
  className,
  showLabel = 'Vis passord',
  hideLabel = 'Skjul passord',
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        className="text-muted hover:text-text focus-visible:outline-ring absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm transition-colors focus-visible:outline-2"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
