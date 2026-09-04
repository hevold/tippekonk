'use client';
/**
 * UploadDropzone — drag-and-drop area (and file button) that uploads to
 * /api/upload with per-file progress bars, then calls `onUploaded` with the
 * stored Media rows.
 *
 *   <UploadDropzone onUploaded={(media) => …} accept="image/*" fields folder="Sport" />
 *
 * Files are validated in the browser first (type and size) so the user gets
 * instant feedback; the server sniffs the real bytes regardless. Uploads run
 * one file per request so a single bad file never sinks the whole batch.
 */
import { CircleAlert, CircleCheck, FileUp, X } from 'lucide-react';
import { useCallback, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { Button, IconButton } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import type { Media, MediaKind } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { acceptForKind, formatBytes } from '@/server/media/mime';

import { checkFile, queueId } from './media-helpers';
import { uploadFiles, UploadRequestError, type UploadFields } from './upload-client';

export type UploadDropzoneProps = {
  onUploaded: (media: Media[]) => void;
  /** `accept` attribute; defaults to every allowed type. */
  accept?: string;
  /** Restrict to one media kind (also used for client-side validation). */
  kind?: MediaKind;
  multiple?: boolean;
  /** Show alt/caption/credit inputs applied to every file in the batch. */
  fields?: boolean;
  /** Default folder for the uploaded files. */
  folder?: string | null;
  compact?: boolean;
  className?: string;
  autoFocus?: boolean;
};

type QueueEntry = {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  percent: number;
  error?: string;
};

export function UploadDropzone({
  onUploaded,
  accept,
  kind,
  multiple = true,
  fields = false,
  folder = null,
  compact = false,
  className,
  autoFocus,
}: UploadDropzoneProps) {
  const t = useT();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<UploadFields>({ alt: '', caption: '', credit: '', folder: folder ?? '' });
  const dragDepth = useRef(0);

  const acceptValue = accept ?? acceptForKind(kind);

  const patch = useCallback((id: string, changes: Partial<QueueEntry>) => {
    setQueue((q) => q.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }, []);

  const start = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const list = multiple ? files : files.slice(0, 1);
      const entries: QueueEntry[] = list.map((file) => {
        const check = checkFile(file, kind);
        if (check.ok) return { id: queueId(), file, status: 'queued', percent: 0 };
        return {
          id: queueId(),
          file,
          status: 'error',
          percent: 0,
          error:
            check.reason === 'size'
              ? t('media.upload.error.size', { limit: formatBytes(check.limit ?? 0) })
              : t('media.upload.error.type'),
        };
      });
      setQueue((q) => [...q.filter((e) => e.status !== 'done'), ...entries]);

      const pending = entries.filter((e) => e.status === 'queued');
      if (pending.length === 0) return;
      setBusy(true);
      const stored: Media[] = [];
      for (const entry of pending) {
        patch(entry.id, { status: 'uploading', percent: 0 });
        try {
          const result = await uploadFiles(
            [entry.file],
            { ...meta, folder: meta.folder || folder },
            {
              onProgress: (p) => patch(entry.id, { percent: p.percent }),
            },
          );
          const failure = result.errors[0];
          if (result.media.length > 0) {
            stored.push(...result.media);
            patch(entry.id, { status: 'done', percent: 100 });
          } else {
            patch(entry.id, { status: 'error', error: failure?.message ?? t('media.upload.error.generic') });
          }
        } catch (err) {
          patch(entry.id, {
            status: 'error',
            error: err instanceof UploadRequestError ? err.message : t('media.upload.error.generic'),
          });
        }
      }
      setBusy(false);
      if (stored.length > 0) onUploaded(stored);
    },
    [folder, kind, meta, multiple, onUploaded, patch, t],
  );

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void start(files);
  }

  function onDragEnter(event: DragEvent) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDragOver(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    void start(files);
  }

  const remove = (id: string) => setQueue((q) => q.filter((e) => e.id !== id));
  const errors = queue.filter((e) => e.status === 'error').length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {fields ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('media.field.alt')} help={t('media.field.altHelp')}>
            <Input
              value={meta.alt ?? ''}
              onChange={(e) => setMeta((m) => ({ ...m, alt: e.target.value }))}
              maxLength={1000}
            />
          </FormField>
          <FormField label={t('media.field.credit')}>
            <Input
              value={meta.credit ?? ''}
              onChange={(e) => setMeta((m) => ({ ...m, credit: e.target.value }))}
              placeholder={t('media.field.creditPlaceholder')}
              maxLength={300}
            />
          </FormField>
          <FormField label={t('media.field.caption')} className="sm:col-span-2">
            <Input
              value={meta.caption ?? ''}
              onChange={(e) => setMeta((m) => ({ ...m, caption: e.target.value }))}
              maxLength={2000}
            />
          </FormField>
          <FormField label={t('media.field.folder')} className="sm:col-span-2">
            <Input
              value={meta.folder ?? ''}
              onChange={(e) => setMeta((m) => ({ ...m, folder: e.target.value }))}
              maxLength={120}
            />
          </FormField>
        </div>
      ) : null}

      <div
        role="group"
        aria-label={t('media.upload.dropzoneLabel')}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'border-border-strong bg-surface-2/40 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center transition-colors',
          compact ? 'px-4 py-5' : 'px-6 py-10',
          dragging && 'border-primary bg-primary-soft',
        )}
      >
        <FileUp className={cn('text-muted size-6', dragging && 'text-primary')} aria-hidden />
        <p className="text-text text-sm font-medium">
          {dragging ? t('media.upload.dropNow') : t('media.upload.dropHint')}
        </p>
        <p className="text-muted text-[13px]">{t('media.upload.hint')}</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={acceptValue}
          multiple={multiple}
          onChange={onInputChange}
          disabled={busy}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => inputRef.current?.click()}
          loading={busy}
          autoFocus={autoFocus}
        >
          {t('media.upload.choose')}
        </Button>
      </div>

      {queue.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite" aria-label={t('media.upload.queueLabel')}>
          {queue.map((entry) => (
            <li
              key={entry.id}
              className="border-border bg-surface flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <span className="shrink-0" aria-hidden>
                {entry.status === 'done' ? (
                  <CircleCheck className="text-success size-4" />
                ) : entry.status === 'error' ? (
                  <CircleAlert className="text-danger size-4" />
                ) : (
                  <FileUp className="text-muted size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{entry.file.name}</span>
                  <span className="text-muted shrink-0 text-xs tabular-nums">
                    {formatBytes(entry.file.size)}
                  </span>
                </div>
                {entry.status === 'uploading' || entry.status === 'queued' ? (
                  <Progress
                    value={entry.percent}
                    size="sm"
                    className="mt-1"
                    label={t('media.upload.progressLabel', { name: entry.file.name })}
                  />
                ) : null}
                {entry.status === 'error' ? (
                  <p className="text-danger mt-0.5 text-[13px]">{entry.error}</p>
                ) : null}
                {entry.status === 'done' ? (
                  <p className="text-success mt-0.5 text-[13px]">{t('media.upload.done')}</p>
                ) : null}
              </div>
              {entry.status !== 'uploading' ? (
                <IconButton label={t('media.upload.remove')} size="sm" onClick={() => remove(entry.id)}>
                  <X />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {errors > 0 && !busy ? (
        <p className="text-muted text-[13px]">{t('media.upload.errorsSummary', { count: errors })}</p>
      ) : null}
    </div>
  );
}
