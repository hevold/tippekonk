'use client';
/**
 * MediaField — pick a single image (logo, OG image) with the MediaPicker.
 * Holds the media id as the form value and keeps the Media row around for
 * the thumbnail. The server passes the initially selected media.
 */
import { ImageIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { MediaThumb } from '@/components/media/media-card';
import { MediaPicker } from '@/components/media/media-picker';
import { Button } from '@/components/ui/button';
import type { Media } from '@/db/schema';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export type MediaFieldProps = {
  value: string | null | undefined;
  onChange: (id: string | null, media: Media | null) => void;
  /** Media row for the initial value (from the server). */
  initialMedia?: Media | null;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Shape of the thumbnail box. */
  aspect?: 'wide' | 'square';
  canUpload?: boolean;
};

export function MediaField({
  value,
  onChange,
  initialMedia = null,
  id,
  disabled,
  className,
  aspect = 'wide',
  canUpload = true,
}: MediaFieldProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<Media | null>(initialMedia);
  const current = value && media && media.id === value ? media : null;

  return (
    <div className={cn('flex flex-wrap items-start gap-4', className)}>
      <div
        className={cn(
          'border-border bg-surface-2 text-muted flex shrink-0 items-center justify-center overflow-hidden rounded-md border',
          aspect === 'wide' ? 'h-24 w-40' : 'size-24',
        )}
      >
        {current ? (
          <MediaThumb media={current} className="h-full w-full" decorative={false} />
        ) : (
          <ImageIcon className="size-6" aria-hidden />
        )}
      </div>
      <div className="grid gap-2">
        <p className="text-muted text-sm">
          {current ? (current.alt ?? current.filename) : t('settings.media.none')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={disabled}
          >
            {current ? t('settings.media.change') : t('settings.media.choose')}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<Trash2 />}
              onClick={() => {
                setMedia(null);
                onChange(null, null);
              }}
              disabled={disabled}
            >
              {t('settings.media.remove')}
            </Button>
          ) : null}
        </div>
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        kind="image"
        canUpload={canUpload}
        onSelect={(picked) => {
          setMedia(picked);
          onChange(picked.id, picked);
        }}
      />
    </div>
  );
}
