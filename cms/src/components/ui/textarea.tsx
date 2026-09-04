'use client';
/**
 * Textarea — styled native textarea; `autoResize` grows with content.
 */
import { useCallback, useEffect, useRef, type ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type TextareaProps = ComponentProps<'textarea'> & {
  invalid?: boolean;
  /** Grow to fit the content (up to `maxRows`). */
  autoResize?: boolean;
  maxRows?: number;
};

export function Textarea({
  className,
  invalid,
  autoResize = false,
  maxRows = 20,
  rows = 3,
  onInput,
  ref,
  ...props
}: TextareaProps) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoResize) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '22') || 22;
    const max = lineHeight * maxRows + 16;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [autoResize, maxRows]);

  useEffect(() => {
    resize();
  }, [resize, props.value, props.defaultValue]);

  return (
    <textarea
      ref={setRefs}
      rows={rows}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      onInput={(e) => {
        onInput?.(e);
        resize();
      }}
      className={cn(
        'bg-surface text-text placeholder:text-subtle flex w-full min-w-0 rounded-md border px-3 py-2 text-[15px] leading-relaxed',
        'border-border shadow-xs transition-colors',
        'hover:border-border-strong',
        'focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring',
        'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
        'disabled:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70',
        autoResize ? 'resize-none' : 'resize-y',
        className,
      )}
      {...props}
    />
  );
}
