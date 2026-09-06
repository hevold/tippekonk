'use client';
/**
 * Small undo/redo stack for the layout editor. `set()` pushes a new entry;
 * consecutive calls with the same `coalesceKey` (typing in one field)
 * overwrite the top entry so one keystroke is not one undo step.
 */
import { useCallback, useRef, useState } from 'react';

export type HistoryApi<T> = {
  value: T;
  set: (next: T, opts?: { coalesceKey?: string }) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
};

const MAX_ENTRIES = 100;

export function useHistory<T>(initial: T): HistoryApi<T> {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>({
    past: [],
    present: initial,
    future: [],
  });
  const lastKey = useRef<string | null>(null);

  const set = useCallback((next: T, opts: { coalesceKey?: string } = {}) => {
    setState((s) => {
      if (Object.is(next, s.present)) return s;
      const coalesce = Boolean(opts.coalesceKey) && lastKey.current === opts.coalesceKey;
      lastKey.current = opts.coalesceKey ?? null;
      const past = coalesce ? s.past : [...s.past, s.present].slice(-MAX_ENTRIES);
      return { past, present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastKey.current = null;
    setState((s) => {
      const previous = s.past[s.past.length - 1];
      if (previous === undefined) return s;
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastKey.current = null;
    setState((s) => {
      const next = s.future[0];
      if (next === undefined) return s;
      return { past: [...s.past, s.present], present: next, future: s.future.slice(1) };
    });
  }, []);

  const reset = useCallback((next: T) => {
    lastKey.current = null;
    setState({ past: [], present: next, future: [] });
  }, []);

  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
