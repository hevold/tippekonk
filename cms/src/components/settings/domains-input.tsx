'use client';
/**
 * DomainsInput — multi-value input for hostnames. Type a domain and press
 * Enter or comma (or paste a list) to add it as a chip; each chip has a
 * remove button. Values are normalised (protocol, port and path stripped)
 * and validated with the same rules as the server.
 */
import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ClipboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { isValidDomain, normalizeDomain } from '@/server/settings/schema';

export type DomainsInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-describedby'?: string;
};

export function DomainsInput({
  value,
  onChange,
  id,
  placeholder,
  disabled,
  invalid,
  className,
  ...rest
}: DomainsInputProps) {
  const t = useT();
  const autoId = useId();
  const inputId = id ?? autoId;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  function commit(raw: string): boolean {
    const parts = raw
      .split(/[\s,;]+/)
      .map(normalizeDomain)
      .filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.find((p) => !isValidDomain(p));
    if (bad) {
      setError(`${t('settings.general.invalidDomain')}: ${bad}`);
      return false;
    }
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft('');
    setError(null);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    if (/[\s,;]/.test(text.trim())) {
      event.preventDefault();
      commit(text);
    }
  }

  return (
    <div className={cn('grid gap-2', className)}>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('settings.general.domains')}>
          {value.map((domain) => (
            <li
              key={domain}
              className="bg-surface-2 text-text inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-sm"
            >
              <span className="font-mono text-[13px]">{domain}</span>
              <button
                type="button"
                className="text-muted hover:text-danger focus-visible:outline-ring inline-flex size-5 items-center justify-center rounded focus-visible:outline-2"
                onClick={() => onChange(value.filter((d) => d !== domain))}
                aria-label={t('settings.general.removeDomain', { domain })}
                disabled={disabled}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          placeholder={placeholder}
          disabled={disabled}
          invalid={invalid || Boolean(error)}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          aria-describedby={rest['aria-describedby']}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => commit(draft)}
          disabled={disabled || !draft.trim()}
        >
          {t('settings.general.addDomain')}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
