/**
 * FormField — label + control + help text + error, with aria wiring.
 *
 *   <FormField label="Tittel" htmlFor="title" required error={errors.title} help="Maks 90 tegn">
 *     <Input id="title" name="title" />
 *   </FormField>
 *
 * How the label finds its control:
 * - A single child that is a form control (`<input>`, `<select>`,
 *   `<textarea>`, `<button>`, or a design-system component that forwards
 *   `id` to its control such as Input, NativeSelect, Combobox, DateTimeInput)
 *   is cloned with `id` (unless it has one), `aria-describedby` and
 *   `aria-invalid`; the label points at that id.
 * - A wrapper child (`<div>`, `<span>`, a fragment, several children) is
 *   never given an id — a label pointing at a div labels nothing. Pass
 *   `controlId` (or `htmlFor`) with the id you set on the real control
 *   inside the wrapper; the wrapper is left untouched, so add
 *   `aria-describedby`/`aria-invalid` on the control yourself when you need
 *   the help/error text announced.
 * - `group` marks children that are a set of controls (RadioGroup, a row of
 *   inputs): the label gets an id and the single child receives
 *   `aria-labelledby` instead of `id`, which is what `role="radiogroup"`
 *   needs.
 */
import { CircleAlert } from 'lucide-react';
import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Label } from './label';

export type FormFieldProps = {
  label: ReactNode;
  /** Id of the control the label points at. Alias of `controlId`, kept for existing call sites. */
  htmlFor?: string;
  /** Id of the real control when `children` is a wrapper around it (see module header). */
  controlId?: string;
  /** `children` is a group of controls: label by `aria-labelledby` instead of `htmlFor`. */
  group?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Put label and control side by side (settings pages). */
  horizontal?: boolean;
  className?: string;
  children: ReactNode;
};

type DescribableProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-labelledby'?: string;
  id?: string;
};

const CONTROL_TAGS = new Set(['input', 'select', 'textarea', 'button']);

export function FormField({
  label,
  htmlFor,
  controlId,
  group,
  help,
  error,
  required,
  horizontal,
  className,
  children,
}: FormFieldProps) {
  const autoId = useId();
  const labelId = `${autoId}-label`;
  // Help text is shown below the control unless an error replaces it (or beside the label when horizontal).
  const helpShown = Boolean(help) && (Boolean(horizontal) || !error);
  const helpId = helpShown ? `${autoId}-help` : undefined;
  const errorId = error ? `${autoId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const element = only && isValidElement<DescribableProps>(only) ? only : null;
  // Intrinsic elements that are not controls (div, span, fieldset…) are wrappers: never stamp an id on them.
  const isWrapper = element !== null && typeof element.type === 'string' && !CONTROL_TAGS.has(element.type);
  const explicitId = controlId ?? htmlFor;

  let control: ReactNode = children;
  let targetId: string | undefined = explicitId;

  if (element && group) {
    control = cloneElement(element, {
      'aria-labelledby': element.props['aria-labelledby'] ?? labelId,
      'aria-describedby': element.props['aria-describedby'] ?? describedBy,
      'aria-invalid': element.props['aria-invalid'] ?? (error ? true : undefined),
    });
    targetId = undefined;
  } else if (element && !isWrapper && (!explicitId || !element.props.id || element.props.id === explicitId)) {
    // The child is (or forwards to) the control: wire it up.
    const id = element.props.id ?? explicitId ?? `${autoId}-control`;
    control = cloneElement(element, {
      id,
      'aria-describedby': element.props['aria-describedby'] ?? describedBy,
      'aria-invalid': element.props['aria-invalid'] ?? (error ? true : undefined),
    });
    targetId = id;
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
        <Label id={group ? labelId : undefined} htmlFor={targetId} required={required}>
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
        {!horizontal && helpShown ? (
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
