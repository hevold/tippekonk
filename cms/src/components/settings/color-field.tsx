'use client';
/**
 * ColorField — hex text input with a native colour picker swatch and a live
 * WCAG contrast read-out against a reference colour.
 */
import { useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { contrastLevel, contrastRatio, formatRatio, hexToRgb, rgbToHex } from '@/server/settings/contrast';

export type ColorFieldProps = {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  /** Colour to compute contrast against (usually the background). */
  contrastWith?: string;
  /** Label used in the contrast text: 'background' or 'text'. */
  contrastKind?: 'background' | 'text';
  name?: string;
};

const LEVEL_VARIANT = { AAA: 'success', AA: 'success', 'AA-large': 'warning', fail: 'danger' } as const;

export function ColorField({
  label,
  help,
  value,
  onChange,
  onBlur,
  error,
  contrastWith,
  contrastKind = 'background',
  name,
}: ColorFieldProps) {
  const t = useT();
  const id = useId();
  const rgb = hexToRgb(value);
  const pickerValue = rgb ? rgbToHex(rgb) : '#000000';
  const ratio = contrastWith ? contrastRatio(value, contrastWith) : null;
  const level = contrastLevel(ratio);

  return (
    <FormField label={label} htmlFor={id} help={help} error={error}>
      <div id={`${id}-wrap`} className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex">
            <input
              type="color"
              value={pickerValue}
              onChange={(e) => onChange(e.target.value)}
              aria-label={t('settings.theme.pickColor', { label })}
              className="border-border focus-visible:outline-ring size-9 cursor-pointer rounded-md border p-0.5 focus-visible:outline-2"
            />
          </span>
          <Input
            id={id}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            invalid={Boolean(error)}
            className="max-w-[9rem] font-mono uppercase"
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
          />
        </div>
        {contrastWith ? (
          <p className={cn('flex items-center gap-2 text-[13px]', 'text-muted')} aria-live="polite">
            <span>
              {t(contrastKind === 'text' ? 'settings.theme.contrastAgainstText' : 'settings.theme.contrast', {
                ratio: formatRatio(ratio),
              })}
            </span>
            <Badge variant={LEVEL_VARIANT[level]}>{t(`settings.theme.contrastLevel.${level}`)}</Badge>
          </p>
        ) : null}
      </div>
    </FormField>
  );
}
