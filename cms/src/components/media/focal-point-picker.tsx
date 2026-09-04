'use client';
/**
 * FocalPointPicker — click (or use the arrow keys) on the image to choose
 * the point that must stay visible when the picture is cropped for teasers.
 * Shows live 16:9 and 1:1 crop previews so the choice is obvious.
 *
 * `FocalPointEditor` wraps the picker with a save button that calls the
 * setFocalPoint server action (admin detail page).
 */
import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { setFocalPoint } from '@/server/media/actions';
import { mediaUrl } from '@/server/media/urls';

export type FocalPoint = { x: number; y: number };

export type FocalPointPickerProps = {
  media: Pick<
    Media,
    'storageKey' | 'variants' | 'kind' | 'mime' | 'width' | 'height' | 'alt' | 'dominantColor'
  >;
  value: FocalPoint;
  onChange: (value: FocalPoint) => void;
  disabled?: boolean;
  className?: string;
};

const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function FocalPointPicker({ media, value, onChange, disabled, className }: FocalPointPickerProps) {
  const t = useT();
  const src = mediaUrl(media, 960);
  const position = `${Math.round(value.x * 100)}% ${Math.round(value.y * 100)}%`;

  function setFromPointer(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    onChange({
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const step = event.shiftKey ? 0.05 : 0.01;
    let next: FocalPoint | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = { x: clamp(value.x - step), y: value.y };
        break;
      case 'ArrowRight':
        next = { x: clamp(value.x + step), y: value.y };
        break;
      case 'ArrowUp':
        next = { x: value.x, y: clamp(value.y - step) };
        break;
      case 'ArrowDown':
        next = { x: value.x, y: clamp(value.y + step) };
        break;
      case 'Home':
        next = { x: 0.5, y: 0.5 };
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(next);
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('media.focal.label')}
        aria-valuetext={t('media.focal.valueText', {
          x: Math.round(value.x * 100),
          y: Math.round(value.y * 100),
        })}
        aria-valuenow={Math.round(value.x * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-disabled={disabled || undefined}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromPointer(e);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'bg-surface-2 relative inline-block max-w-full touch-none overflow-hidden rounded-md select-none',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
          disabled ? 'cursor-default opacity-70' : 'cursor-crosshair',
        )}
        style={{ backgroundColor: media.dominantColor ?? undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SPEC: plain <img> with srcset, no next/image */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="block max-h-[28rem] max-w-full"
          width={media.width ?? undefined}
          height={media.height ?? undefined}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.5)]"
          style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }}
        >
          <span className="bg-primary absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </span>
      </div>
      <p className="text-muted text-[13px]">{t('media.focal.help')}</p>
      <div className="flex flex-wrap gap-3">
        {(['16 / 9', '1 / 1', '4 / 5'] as const).map((ratio) => (
          <figure key={ratio} className="flex flex-col gap-1">
            <div className="bg-surface-2 w-32 overflow-hidden rounded" style={{ aspectRatio: ratio }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- SPEC: plain <img> with srcset, no next/image */}
              <img
                src={mediaUrl(media, 320)}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: position }}
                draggable={false}
              />
            </div>
            <figcaption className="text-muted text-xs">{ratio.replace(/ /g, '')}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export type FocalPointEditorProps = {
  media: Media;
  canEdit: boolean;
  className?: string;
};

export function FocalPointEditor({ media, canEdit, className }: FocalPointEditorProps) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<FocalPoint>({ x: media.focalX, y: media.focalY });
  const [saving, setSaving] = useState(false);
  const dirty = value.x !== media.focalX || value.y !== media.focalY;

  async function save() {
    setSaving(true);
    const result = await setFocalPoint({ id: media.id, focalX: value.x, focalY: value.y });
    setSaving(false);
    if (result.ok) {
      toast.success(t('media.focal.saved'));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <FocalPointPicker media={media} value={value} onChange={setValue} disabled={!canEdit} />
      {canEdit ? (
        <div className="flex items-center gap-2">
          <Button onClick={save} loading={saving} disabled={!dirty}>
            {t('media.focal.save')}
          </Button>
          <Button variant="ghost" onClick={() => setValue({ x: 0.5, y: 0.5 })} disabled={saving}>
            {t('media.focal.reset')}
          </Button>
          <span className="text-muted text-[13px] tabular-nums" aria-live="polite">
            {Math.round(value.x * 100)} % · {Math.round(value.y * 100)} %
          </span>
        </div>
      ) : null}
    </div>
  );
}
