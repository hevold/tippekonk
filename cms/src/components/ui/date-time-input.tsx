'use client';
/**
 * DateTimeInput — <input type="datetime-local"> that reads/writes Date objects
 * in Europe/Oslo regardless of the browser's time zone. Shows the resolved
 * Oslo time as a hint so editors abroad are not surprised.
 */
import { CalendarClock, X } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { fromOsloInputValue, toOsloInputValue } from './date-time';
import { formatDateTime } from './format';
import { inputClassName } from './input';

export type DateTimeInputProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  id?: string;
  name?: string;
  min?: Date;
  max?: Date;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  /** Show a clear (×) button when a value is set. */
  clearable?: boolean;
  /** Show "Europe/Oslo · 4. sep. 2026 14:02" under the input. */
  showHint?: boolean;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

export function DateTimeInput({
  value,
  onChange,
  id,
  name,
  min,
  max,
  disabled,
  required,
  invalid,
  clearable = true,
  showHint = true,
  className,
  ...aria
}: DateTimeInputProps) {
  const t = useT();
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  // Keep the raw text while the user types an incomplete value.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? toOsloInputValue(value);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const parsed = fromOsloInputValue(raw);
    if (raw === '') {
      setDraft(null);
      onChange(null);
      return;
    }
    if (parsed) {
      setDraft(null);
      onChange(parsed);
    } else {
      setDraft(raw);
    }
  }

  const describedBy =
    [aria['aria-describedby'], showHint ? hintId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('grid gap-1', className)}>
      <div className="relative">
        <CalendarClock
          className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          id={inputId}
          name={name}
          type="datetime-local"
          value={display}
          onChange={handleChange}
          onBlur={() => setDraft(null)}
          min={min ? toOsloInputValue(min) : undefined}
          max={max ? toOsloInputValue(max) : undefined}
          step={60}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || aria['aria-invalid'] || undefined}
          aria-describedby={describedBy}
          className={cn(inputClassName, 'pl-9', clearable && value && 'pr-9')}
        />
        {clearable && value && !disabled ? (
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              onChange(null);
            }}
            aria-label={t('ui.clear')}
            className="text-muted hover:text-text hover:bg-surface-2 focus-visible:outline-ring absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {showHint ? (
        <p id={hintId} className="text-subtle text-xs tabular-nums">
          {value ? t('ui.dateTime.hint', { value: formatDateTime(value) }) : t('ui.dateTime.hintEmpty')}
        </p>
      ) : null}
    </div>
  );
}
