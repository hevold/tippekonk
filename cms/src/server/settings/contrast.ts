/**
 * WCAG 2.1 colour contrast (pure). Used by the theme form to show the ratio
 * between text/primary/accent and the background, and to flag combinations
 * below AA (4.5:1 normal text, 3:1 large text and UI components).
 */

export type Rgb = { r: number; g: number; b: number };

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance 0..1 per WCAG. */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio 1..21, or null when either colour is not a valid hex. */
export function contrastRatio(foreground: string, background: string): number | null {
  const f = hexToRgb(foreground);
  const b = hexToRgb(background);
  if (!f || !b) return null;
  const lf = relativeLuminance(f);
  const lb = relativeLuminance(b);
  const light = Math.max(lf, lb);
  const dark = Math.min(lf, lb);
  return (light + 0.05) / (dark + 0.05);
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

export function contrastLevel(ratio: number | null): ContrastLevel {
  if (ratio === null) return 'fail';
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA-large';
  return 'fail';
}

/** "4.6:1" in Norwegian formatting. */
export function formatRatio(ratio: number | null): string {
  if (ratio === null) return '–';
  return `${ratio.toFixed(ratio >= 10 ? 1 : 2).replace('.', ',')}:1`;
}

/** Black or white, whichever reads better on the given colour. */
export function readableTextOn(background: string): '#000000' | '#ffffff' {
  const onWhite = contrastRatio('#ffffff', background) ?? 0;
  const onBlack = contrastRatio('#000000', background) ?? 0;
  return onWhite >= onBlack ? '#ffffff' : '#000000';
}
