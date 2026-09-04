'use client';
/**
 * Combobox — searchable select built on cmdk inside a Popover. Supports single
 * and multiple selection, async loading and "create new" from the search text.
 *
 *   <Combobox options={sections} value={sectionId} onChange={setSectionId} placeholder="Velg seksjon" />
 *   <Combobox multiple creatable options={tags} value={tagIds} onChange={setTagIds} onCreate={createTag} />
 *
 * The trigger is a button with role="combobox"; the list is a listbox with
 * full keyboard support (arrows, Enter, Escape) provided by cmdk.
 */
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Spinner } from './spinner';

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Extra search terms. */
  keywords?: string[];
  icon?: ReactNode;
};

type CommonProps = {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Show "Opprett «…»" when the search text matches no option. */
  creatable?: boolean;
  onCreate?: (label: string) => void | Promise<void>;
  /** Show a spinner in the list (async options). */
  loading?: boolean;
  emptyText?: string;
  /** Called with the search text (for server-side option loading). */
  onSearchChange?: (query: string) => void;
  /** Allow clearing a single value with the × button. Default true. */
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** Width class for the popover; defaults to the trigger width. */
  contentClassName?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

type SingleProps = CommonProps & {
  multiple?: false;
  value: string | null;
  onChange: (value: string | null) => void;
};

type MultipleProps = CommonProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

export type ComboboxProps = SingleProps | MultipleProps;

function normalize(s: string): string {
  return s.trim().toLocaleLowerCase('nb-NO');
}

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder,
    searchPlaceholder,
    creatable = false,
    onCreate,
    loading = false,
    emptyText,
    onSearchChange,
    clearable = true,
    disabled,
    invalid,
    id,
    name,
    className,
    contentClassName,
    size = 'md',
  } = props;
  const t = useT();
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedValues = useMemo<string[]>(
    () => (props.multiple ? props.value : props.value ? [props.value] : []),
    [props.multiple, props.value],
  );
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selectedOptions = selectedValues.map((v) => byValue.get(v) ?? { value: v, label: v });

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }

  function select(value: string) {
    if (props.multiple) {
      const next = props.value.includes(value)
        ? props.value.filter((v) => v !== value)
        : [...props.value, value];
      props.onChange(next);
    } else {
      props.onChange(props.value === value && clearable ? null : value);
      changeOpen(false);
      triggerRef.current?.focus();
    }
  }

  function remove(value: string) {
    if (props.multiple) props.onChange(props.value.filter((v) => v !== value));
    else props.onChange(null);
  }

  async function create() {
    const label = query.trim();
    if (!label || !onCreate) return;
    setCreating(true);
    try {
      await onCreate(label);
      setQuery('');
      if (!props.multiple) changeOpen(false);
    } finally {
      setCreating(false);
    }
  }

  const trimmed = query.trim();
  const exactExists = trimmed !== '' && options.some((o) => normalize(o.label) === normalize(trimmed));
  const showCreate = creatable && !!onCreate && trimmed !== '' && !exactExists;

  const hasValue = selectedValues.length > 0;
  const isInvalid = invalid || props['aria-invalid'] || undefined;

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : changeOpen}>
      <div className={cn('relative w-full', className)}>
        {name ? selectedValues.map((v) => <input key={v} type="hidden" name={name} value={v} />) : null}
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            id={triggerId}
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={open ? listId : undefined}
            aria-label={props['aria-label']}
            aria-describedby={props['aria-describedby']}
            aria-invalid={isInvalid}
            disabled={disabled}
            className={cn(
              'bg-surface text-text border-border flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md border text-left shadow-xs transition-colors',
              'hover:border-border-strong',
              'focus-visible:border-ring focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-0',
              'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
              'disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70',
              'data-[state=open]:border-ring',
              size === 'sm' ? 'min-h-8 px-2.5 py-1 text-sm' : 'min-h-9 px-3 py-1 text-[15px]',
              hasValue && clearable && !props.multiple && 'pr-14',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {!hasValue ? (
                <span className="text-subtle truncate">{placeholder ?? t('ui.combobox.placeholder')}</span>
              ) : props.multiple ? (
                selectedOptions.map((o) => (
                  <span
                    key={o.value}
                    className="bg-surface-2 text-text inline-flex max-w-full items-center gap-1 rounded-sm py-0.5 pr-1 pl-2 text-[13px] leading-5"
                  >
                    <span className="truncate">{o.label}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={t('ui.combobox.remove', { label: o.label })}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(o.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace') {
                          e.preventDefault();
                          e.stopPropagation();
                          remove(o.value);
                        }
                      }}
                      className="text-muted hover:text-text hover:bg-surface-3 focus-visible:outline-ring inline-flex size-4 items-center justify-center rounded-xs focus-visible:outline-2 focus-visible:outline-offset-1"
                    >
                      <X className="size-3" aria-hidden />
                    </span>
                  </span>
                ))
              ) : (
                <span className="flex min-w-0 items-center gap-2 truncate">
                  {selectedOptions[0]?.icon}
                  <span className="truncate">{selectedOptions[0]?.label}</span>
                </span>
              )}
            </span>
            <ChevronsUpDown className="text-muted ml-auto size-4 shrink-0" aria-hidden />
          </button>
        </PopoverTrigger>
        {hasValue && clearable && !props.multiple && !disabled ? (
          <button
            type="button"
            onClick={() => remove(selectedValues[0]!)}
            aria-label={t('ui.clear')}
            className="text-muted hover:text-text hover:bg-surface-2 focus-visible:outline-ring absolute top-1/2 right-8 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <PopoverContent
        align="start"
        className={cn('w-[var(--radix-popover-trigger-width)] min-w-56 p-0', contentClassName)}
        onOpenAutoFocus={(e) => {
          // cmdk focuses its own input; keep Radix from grabbing focus first.
          e.preventDefault();
        }}
      >
        <Command
          loop
          label={props['aria-label'] ?? placeholder ?? t('ui.combobox.placeholder')}
          filter={(value, search, keywords) => {
            const haystack = normalize([value, ...(keywords ?? [])].join(' '));
            return haystack.includes(normalize(search)) ? 1 : 0;
          }}
        >
          <div className="border-border flex items-center border-b px-2.5">
            <Command.Input
              autoFocus
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                onSearchChange?.(v);
              }}
              placeholder={searchPlaceholder ?? t('ui.combobox.search')}
              className="placeholder:text-subtle h-9 w-full bg-transparent text-sm outline-none"
            />
            {loading ? <Spinner size="sm" className="text-muted" /> : null}
          </div>
          <Command.List id={listId} className="max-h-64 overflow-y-auto p-1">
            {!loading ? (
              <Command.Empty className="text-muted px-2 py-6 text-center text-sm">
                {emptyText ?? t('ui.combobox.empty')}
              </Command.Empty>
            ) : null}
            {options.map((o) => {
              const selected = selectedValues.includes(o.value);
              return (
                <Command.Item
                  key={o.value}
                  value={o.label}
                  keywords={[o.value, ...(o.keywords ?? [])]}
                  disabled={o.disabled}
                  onSelect={() => select(o.value)}
                  aria-selected={selected}
                  className={cn(
                    'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
                    'data-[selected=true]:bg-surface-2 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
                  )}
                >
                  <span
                    className={cn(
                      'border-border-strong flex size-4 shrink-0 items-center justify-center rounded-xs border',
                      props.multiple ? 'bg-surface' : 'border-transparent',
                      selected && props.multiple && 'bg-primary border-primary text-primary-foreground',
                    )}
                    aria-hidden
                  >
                    {selected ? (
                      <Check className={cn('size-3', !props.multiple && 'text-primary')} strokeWidth={3} />
                    ) : null}
                  </span>
                  {o.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.description ? (
                      <span className="text-muted block truncate text-xs">{o.description}</span>
                    ) : null}
                  </span>
                </Command.Item>
              );
            })}
            {showCreate ? (
              <Command.Item
                value={`__create__${trimmed}`}
                forceMount
                disabled={creating}
                onSelect={create}
                className={cn(
                  'text-primary relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
                  'data-[selected=true]:bg-surface-2 data-[disabled=true]:opacity-50',
                )}
              >
                {creating ? <Spinner size="sm" /> : <Plus className="size-4" aria-hidden />}
                <span className="truncate">{t('ui.combobox.create', { label: trimmed })}</span>
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
