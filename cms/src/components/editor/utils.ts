/**
 * Small helpers for the editor components: debounce hook, platform detection
 * and shortcut labels.
 */
import { useEffect, useMemo, useRef } from 'react';

/** Debounced callback that always calls the latest `fn`; flushes pending work on unmount. */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): { call: (...args: A) => void; flush: () => void; cancel: () => void } {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<A | null>(null);

  const api = useMemo(() => {
    const cancel = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    };
    const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const args = pending.current;
      pending.current = null;
      if (args) fnRef.current(...args);
    };
    const call = (...args: A) => {
      pending.current = args;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    };
    return { call, flush, cancel };
  }, [delayMs]);

  useEffect(() => () => api.flush(), [api]);
  return api;
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** "⌘B" on macOS, "Ctrl+B" elsewhere. Accepts "Mod-B", "Mod-Shift-8", "Mod-Alt-2". */
export function shortcutLabel(shortcut: string): string {
  const mac = isMacPlatform();
  return shortcut
    .split('-')
    .map((part) => {
      switch (part) {
        case 'Mod':
          return mac ? '⌘' : 'Ctrl';
        case 'Shift':
          return mac ? '⇧' : 'Shift';
        case 'Alt':
          return mac ? '⌥' : 'Alt';
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(mac ? '' : '+');
}

/** Cheap structural equality for documents (they are plain JSON). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
