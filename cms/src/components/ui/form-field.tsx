/**
 * FormField — label + control + help text + error, with aria wiring.
 *
 *   <FormField label="Tittel" htmlFor="title" required error={errors.title} help="Maks 90 tegn">
 *     <Input id="title" name="title" />
 *   </FormField>
 *
 * The control is cloned with `aria-describedby` / `aria-invalid` when it is a
 * single React element and does not already set them.
 */
import { CircleAlert } from 'lucide-react';
import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Label } from './label';

export type FormFieldProps = {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Put label and control side by side (settings pages). */
  horizontal?: boolean;
  className?: string;
  children: ReactNode;
};

type DescribableProps = { 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; id?: string };

export function FormField({ label, htmlFor, help, error, required, horizontal, className, children }: FormFieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? `${autoId}-control`;
  const helpId = help ? `${autoId}-help` : undefined;
  const errorId = error ? `${autoId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  let control: ReactNode = children;
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  if (only && isValidElement<DescribableProps>(only)) {
    control = cloneElement(only, {
      id: only.props.id ?? controlId,
      'aria-describedby': only.props['aria-describedby'] ?? describedBy,
      'aria-invalid': only.props['aria-invalid'] ?? (error ? true : undefined),
    });
  }

  return (
    <div
      className={cn(
        'grid gap-1.5',
        horizontal && 'sm:grid-cols-[minmax(10rem,14rem)_1fr] sm:items-start sm:gap-x-6',
        className,
      )}
    >
      <div className={cn('flex flex-col gap-0.5', horizontal && 'sm:pt-2')}>
        <Label htmlFor={htmlFor ?? (only ? controlId : undefined)} required={required}>
          {label}
        </Label>
        {horizontal && help ? (
          <p id={helpId} className="text-muted text-[13px] leading-5">
            {help}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        {control}
        {!horizontal && help && !error ? (
          <p id={helpId} className="text-muted text-[13px] leading-5">
            {help}
          </p>
        ) : null}
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    </div>
  );
}

export type FieldErrorProps = ComponentProps<'p'>;

export function FieldError({ className, children, ...props }: FieldErrorProps) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className={cn('text-danger flex items-start gap-1.5 text-[13px] leading-5 font-medium', className)}
      {...props}
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
