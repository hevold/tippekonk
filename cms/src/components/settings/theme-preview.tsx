'use client';
/**
 * ThemePreview — a fake masthead and teaser rendered with the theme tokens
 * the form currently holds, so colour and font choices can be judged before
 * saving. Pure presentation; no data.
 */
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { hexToRgb, readableTextOn } from '@/server/settings/contrast';

export type ThemePreviewValues = {
  primary: string;
  accent: string;
  background: string;
  text: string;
  fontHeading: 'serif' | 'sans';
  fontBody: 'serif' | 'sans';
  radius: 'none' | 'sm' | 'md' | 'lg';
  contentWidth: number;
  showTagline: boolean;
  showDate: boolean;
};

const RADIUS: Record<ThemePreviewValues['radius'], string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '14px',
};

function safe(hex: string, fallback: string): string {
  return hexToRgb(hex) ? hex : fallback;
}

export function ThemePreview({
  values,
  siteName,
  tagline,
  logoUrl,
}: {
  values: ThemePreviewValues;
  siteName: string;
  tagline: string | null;
  logoUrl?: string | null;
}) {
  const t = useT();
  const primary = safe(values.primary, '#0b3d91');
  const accent = safe(values.accent, '#d9291c');
  const background = safe(values.background, '#ffffff');
  const text = safe(values.text, '#111111');
  const radius = RADIUS[values.radius] ?? '4px';
  const headingFont = values.fontHeading === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';
  const bodyFont = values.fontBody === 'serif' ? 'var(--font-serif)' : 'var(--font-sans)';
  const today = new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div
      className="border-border overflow-hidden rounded-lg border shadow-xs"
      style={{ background, color: text, fontFamily: bodyFont }}
      aria-label={t('settings.theme.preview')}
    >
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: `3px solid ${primary}` }}>
        {values.showDate ? (
          <p className="text-[11px] opacity-70" style={{ textTransform: 'capitalize' }}>
            {today}
          </p>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of the stored logo
              <img src={logoUrl} alt={siteName} className="max-h-10 max-w-[12rem] object-contain" />
            ) : (
              <p
                className="truncate text-2xl leading-tight font-bold"
                style={{ fontFamily: headingFont, color: primary }}
              >
                {siteName}
              </p>
            )}
            {values.showTagline && tagline ? (
              <p className="truncate text-[12px] opacity-75">{tagline}</p>
            ) : null}
          </div>
          <span
            className="shrink-0 px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: primary, color: readableTextOn(primary), borderRadius: radius }}
          >
            {t('settings.theme.previewButton')}
          </span>
        </div>
        <nav className="mt-3 flex gap-4 text-[13px] font-medium" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} style={{ color: n === 1 ? primary : text }}>
              {t(`settings.theme.previewMenu${n}`)}
            </span>
          ))}
        </nav>
      </div>
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase">
          <span
            className="px-1.5 py-0.5"
            style={{ background: accent, color: readableTextOn(accent), borderRadius: radius }}
          >
            {t('settings.theme.previewBreaking')}
          </span>
          <span style={{ color: primary }}>{t('settings.theme.previewKicker')}</span>
        </div>
        <div
          className="h-24 w-full"
          style={{
            borderRadius: radius,
            background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`,
            opacity: 0.85,
          }}
          aria-hidden
        />
        <p className={cn('text-lg leading-snug font-bold')} style={{ fontFamily: headingFont }}>
          {t('settings.theme.previewTitle')}
        </p>
        <p className="text-[13px] leading-relaxed opacity-85">{t('settings.theme.previewLead')}</p>
        <div className="flex items-center justify-between text-[12px] opacity-75">
          <span>{t('settings.theme.previewByline')}</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: accent, color: readableTextOn(accent), borderRadius: radius }}
          >
            {t('settings.theme.previewPlus')}
          </span>
        </div>
      </div>
      <div className="border-t px-4 py-2 text-[11px] opacity-60" style={{ borderColor: `${text}22` }}>
        max-width: {values.contentWidth}px
      </div>
    </div>
  );
}
