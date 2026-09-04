'use client';
/**
 * MediaCard — one item in a media grid or list: thumbnail (poster for
 * GIF/video-less kinds), filename, dimensions/size, optional selection
 * checkbox and an "open" link. Used by the admin library and the picker.
 */
import { FileAudio, FileText, FileVideo, ImageOff } from 'lucide-react';
import Link from 'next/link';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/server/media/mime';
import { focalObjectPosition, mediaPosterUrl } from '@/server/media/urls';

import { dimensionsLabel, kindLabelKey } from './media-helpers';

export type MediaCardProps = {
  media: Media;
  /** Show a selection checkbox and selected styling. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean, event?: MouseEvent | KeyboardEvent) => void;
  /** Whole card click (e.g. pick in the picker). When set, the card is a button. */
  onActivate?: (media: Media) => void;
  /** Link target for the "open" affordance (admin detail page). */
  href?: string;
  view?: 'grid' | 'list';
  /** Extra content under the meta line (badges, actions). */
  footer?: ReactNode;
  className?: string;
};

export function MediaKindIcon({ kind, className }: { kind: Media['kind']; className?: string }) {
  const cls = cn('size-8', className);
  switch (kind) {
    case 'video':
      return <FileVideo className={cls} aria-hidden />;
    case 'audio':
      return <FileAudio className={cls} aria-hidden />;
    case 'document':
      return <FileText className={cls} aria-hidden />;
    default:
      return <ImageOff className={cls} aria-hidden />;
  }
}

/** Thumbnail box shared by grid and list rows. */
export function MediaThumb({
  media,
  className,
  sizes = '240px',
  decorative = true,
}: {
  media: Media;
  className?: string;
  sizes?: string;
  decorative?: boolean;
}) {
  const t = useT();
  if (media.kind === 'image') {
    return (
      <div
        className={cn('bg-surface-2 relative overflow-hidden', className)}
        style={{ backgroundColor: media.dominantColor ?? undefined }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SPEC: plain <img> with srcset, no next/image */}
        <img
          src={mediaPosterUrl(media, 640)}
          alt={decorative ? '' : (media.alt ?? media.filename)}
          loading="lazy"
          decoding="async"
          sizes={sizes}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: focalObjectPosition(media) }}
          draggable={false}
        />
      </div>
    );
  }
  return (
    <div
      className={cn('bg-surface-2 text-muted flex items-center justify-center', className)}
      role="img"
      aria-label={t(kindLabelKey(media.kind))}
    >
      <MediaKindIcon kind={media.kind} />
    </div>
  );
}

export function MediaCard({
  media,
  selectable = false,
  selected = false,
  onSelectedChange,
  onActivate,
  href,
  view = 'grid',
  footer,
  className,
}: MediaCardProps) {
  const t = useT();
  const dims = dimensionsLabel(media);
  const metaLine = [dims, formatBytes(media.size)].filter(Boolean).join(' · ');
  const missingAlt = media.kind === 'image' && !media.alt;

  function handleActivate(event: MouseEvent | KeyboardEvent) {
    if (onActivate) onActivate(media);
    else if (selectable) onSelectedChange?.(!selected, event);
  }

  const interactive = Boolean(onActivate || selectable);

  const checkbox =
    selectable && onSelectedChange ? (
      <span
        className={cn(
          'absolute top-2 left-2 z-10 rounded-sm bg-white/90 p-0.5 shadow-xs transition-opacity',
          !selected && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectedChange(v === true)}
          aria-label={t('media.card.select', { name: media.filename })}
        />
      </span>
    ) : null;

  if (view === 'list') {
    return (
      <div
        className={cn(
          'group border-border bg-surface relative flex items-center gap-3 rounded-md border p-2',
          selected && 'border-primary bg-primary-soft/40',
          interactive && 'hover:bg-surface-2 cursor-pointer',
          className,
        )}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-pressed={selectable ? selected : undefined}
        onClick={interactive ? handleActivate : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleActivate(e);
                }
              }
            : undefined
        }
      >
        {selectable && onSelectedChange ? (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="pl-1">
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onSelectedChange(v === true)}
              aria-label={t('media.card.select', { name: media.filename })}
            />
          </span>
        ) : null}
        <MediaThumb media={media} className="size-14 shrink-0 rounded" sizes="56px" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {href ? (
              <Link href={href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                {media.filename}
              </Link>
            ) : (
              media.filename
            )}
          </p>
          <p className="text-muted truncate text-[13px]">
            {media.alt || <span className="italic">{t('media.card.noAlt')}</span>}
          </p>
        </div>
        <div className="text-muted hidden shrink-0 text-right text-[13px] tabular-nums sm:block">
          <p>{metaLine}</p>
          <p>{media.credit ?? ''}</p>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group border-border bg-surface relative flex flex-col overflow-hidden rounded-md border transition-shadow',
        'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
        selected && 'border-primary ring-primary ring-2',
        interactive && 'cursor-pointer hover:shadow-md',
        className,
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={selectable ? selected : undefined}
      aria-label={interactive ? media.filename : undefined}
      onClick={interactive ? handleActivate : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActivate(e);
              }
            }
          : undefined
      }
    >
      {checkbox}
      <MediaThumb media={media} className="aspect-[4/3] w-full" />
      {missingAlt ? (
        <Badge variant="warning" className="absolute top-2 right-2">
          {t('media.card.missingAlt')}
        </Badge>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
        <p className="truncate text-[13px] font-medium" title={media.filename}>
          {href ? (
            <Link href={href} className="hover:underline" onClick={(e) => e.stopPropagation()}>
              {media.filename}
            </Link>
          ) : (
            media.filename
          )}
        </p>
        <p className="text-muted truncate text-xs tabular-nums">{metaLine || t(kindLabelKey(media.kind))}</p>
        {footer}
      </div>
    </div>
  );
}
