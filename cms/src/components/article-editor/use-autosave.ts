'use client';
/**
 * useAutosave — background saving for the editor. Posts the current payload
 * to /api/articles/[id]/autosave every `intervalMs` while there are unsaved
 * changes; `save('manual')` is the same call with a manual revision. A save
 * in flight is never overlapped: a request that arrives meanwhile is queued
 * and runs once with the newest payload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SavingState } from '@/components/ui/saving-indicator';
import type { ArticleInputRaw } from '@/lib/validation/article';

import type { SaveKind, SaveOutcome } from './types';

export type UseAutosaveOptions = {
  articleId: string;
  /** Autosave timer runs only when true (editable + lock held). */
  enabled: boolean;
  intervalMs: number;
  getPayload: () => ArticleInputRaw;
  /** Serialised payload comparison key, so we know what the last save covered. */
  getPayloadKey: () => string;
  isDirty: () => boolean;
  /** Current version, kept in a ref by the host so saves always send the latest. */
  getVersion: () => number;
  onSaved: (result: { version: number; savedAt: Date; slug: string; payloadKey: string; kind: SaveKind }) => void;
  onConflict: (info: { message: string; currentVersion?: number }) => void;
  onError: (message: string, fieldErrors?: Record<string, string[]>) => void;
};

export type UseAutosave = {
  state: SavingState;
  savedAt: Date | null;
  error: string | null;
  saving: boolean;
  save: (kind: SaveKind, opts?: { version?: number }) => Promise<SaveOutcome>;
};

type ErrorBody = {
  error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; currentVersion?: number };
};

export function useAutosave(options: UseAutosaveOptions): UseAutosave {
  const [state, setState] = useState<SavingState>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<SaveOutcome> | null>(null);
  const queued = useRef<SaveKind | null>(null);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  const run = useCallback(async (kind: SaveKind, version: number): Promise<SaveOutcome> => {
    const o = opts.current;
    const payload = o.getPayload();
    const payloadKey = o.getPayloadKey();
    setState('saving');
    setError(null);
    try {
      const res = await fetch(`/api/articles/${o.articleId}/autosave`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input: payload, expectedVersion: version, kind }),
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = (await res.json()) as { version: number; savedAt: string; slug: string };
        const at = new Date(data.savedAt);
        setSavedAt(at);
        setState('saved');
        o.onSaved({ version: data.version, savedAt: at, slug: data.slug, payloadKey, kind });
        return { ok: true, version: data.version, savedAt: at, slug: data.slug };
      }
      let body: ErrorBody = {};
      try {
        body = (await res.json()) as ErrorBody;
      } catch {
        /* non-JSON error body */
      }
      const code = body.error?.code ?? (res.status === 409 ? 'conflict' : 'internal');
      const message = body.error?.message ?? 'Kunne ikke lagre. Prøv igjen.';
      setState('error');
      setError(message);
      if (res.status === 409 || code === 'conflict') {
        o.onConflict({ message, currentVersion: body.error?.currentVersion });
      } else {
        o.onError(message, body.error?.fieldErrors);
      }
      return { ok: false, code, message, fieldErrors: body.error?.fieldErrors, currentVersion: body.error?.currentVersion };
    } catch (err) {
      console.error('[articles] save', err);
      const message = 'Mistet kontakt med tjeneren. Endringene er ikke lagret.';
      setState('error');
      setError(message);
      o.onError(message);
      return { ok: false, code: 'network', message };
    }
  }, []);

  const save = useCallback(
    async (kind: SaveKind, saveOpts: { version?: number } = {}): Promise<SaveOutcome> => {
      if (inFlight.current) {
        // Manual saves outrank autosaves for the queued slot.
        if (kind === 'manual' || queued.current === null) queued.current = kind;
        const previous = await inFlight.current;
        if (!previous.ok) {
          queued.current = null;
          return previous;
        }
      }
      let nextKind: SaveKind | null = kind;
      let version = saveOpts.version;
      let result: SaveOutcome = { ok: false, code: 'internal', message: '' };
      // Loop instead of recursing: a save that arrived while we were busy runs once with the newest payload.
      while (nextKind) {
        const promise = run(nextKind, version ?? opts.current.getVersion()).finally(() => {
          inFlight.current = null;
        });
        inFlight.current = promise;
        result = await promise;
        version = undefined;
        const pending = queued.current;
        queued.current = null;
        nextKind = result.ok && pending && opts.current.isDirty() ? pending : null;
      }
      return result;
    },
    [run],
  );

  // Periodic autosave while dirty.
  useEffect(() => {
    if (!options.enabled) return;
    const timer = window.setInterval(() => {
      const o = opts.current;
      if (!o.enabled || !o.isDirty() || inFlight.current) return;
      void save('autosave');
    }, Math.max(3000, options.intervalMs));
    return () => window.clearInterval(timer);
  }, [options.enabled, options.intervalMs, save]);

  return { state, savedAt, error, saving: state === 'saving', save };
}
