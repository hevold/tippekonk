/**
 * Public theme → CSS. Turns `settings.theme` into the `--site-*` custom
 * properties (SPEC 7) and, when `darkMode === 'auto'`, a dark override under
 * `prefers-color-scheme: dark`. Pure: no database, no Next.js — the public
 * layout injects the result in a <style> element and tests assert on it.
 *
 * Values are validated hex colours / enums from `siteSettingsSchema`, but the
 * CSS is built only from whitelisted tokens anyway, so nothing user-typed can
 * ever break out of a declaration.
 */
import type { SiteSettings } from '@/lib/validation/site';

export type ThemeSettings = SiteSettings['theme'];

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const RADIUS: Record<ThemeSettings['radius'], string> = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '14px',
};

const FONT_STACKS = {
  serif: "var(--font-serif, 'Source Serif 4 Variable', Georgia, 'Times New Roman', serif)",
  sans: "var(--font-sans, 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)",
} as const;

function hex(value: string, fallback: string): string {
  return HEX_RE.test(value) ? value : fallback;
}

/** Parse "#rgb"/"#rrggbb" into 0..255 channels. */
export function hexToRgb(value: string): { r: number; g: number; b: number } {
  const h = value.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(value: string): number {
  const { r, g, b } = hexToRgb(value);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Lighten a colour towards white for dark backgrounds (0..1). */
export function lighten(value: string, amount: number): string {
  const { r, g, b } = hexToRgb(value);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to(mix(r))}${to(mix(g))}${to(mix(b))}`;
}

export type ThemeVars = Record<`--site-${string}`, string>;

/** Light-mode custom properties for the theme. */
export function themeVariables(theme: ThemeSettings): ThemeVars {
  const primary = hex(theme.primary, '#0b3d91');
  const accent = hex(theme.accent, '#d9291c');
  const background = hex(theme.background, '#ffffff');
  const text = hex(theme.text, '#111111');
  return {
    '--site-primary': primary,
    '--site-accent': accent,
    '--site-bg': background,
    '--site-text': text,
    '--site-font-heading': FONT_STACKS[theme.fontHeading] ?? FONT_STACKS.serif,
    '--site-font-body': FONT_STACKS[theme.fontBody] ?? FONT_STACKS.sans,
    '--site-radius': RADIUS[theme.radius] ?? RADIUS.sm,
    '--site-content-width': `${Math.min(1600, Math.max(960, Math.round(theme.contentWidth || 1200)))}px`,
  };
}

/** Dark-mode overrides (only used when darkMode === 'auto'). */
export function darkThemeVariables(theme: ThemeSettings): ThemeVars {
  const primary = hex(theme.primary, '#0b3d91');
  const accent = hex(theme.accent, '#d9291c');
  return {
    '--site-primary': luminance(primary) < 0.35 ? lighten(primary, 0.45) : primary,
    '--site-accent': luminance(accent) < 0.35 ? lighten(accent, 0.35) : accent,
    '--site-bg': '#141413',
    '--site-text': '#ececea',
  };
}

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
}

/**
 * The full <style> text for the public site: `:root` variables, a light
 * colour scheme locked in (the admin tokens follow the OS, the newspaper
 * does not unless darkMode is 'auto'), and the optional dark override.
 */
export function themeCss(theme: ThemeSettings): string {
  const light = themeVariables(theme);
  const lightTokens = {
    '--bg': 'var(--site-bg)',
    '--surface': '#ffffff',
    '--surface-2': '#f4f4f1',
    '--surface-3': '#ebebe7',
    '--border': '#e3e2dd',
    '--border-strong': '#cdccc5',
    '--text': 'var(--site-text)',
    '--text-muted': '#5f5e57',
    '--text-subtle': '#87867e',
    '--primary': 'var(--site-primary)',
    '--primary-hover': 'var(--site-primary)',
    '--ring': 'var(--site-primary)',
    'color-scheme': 'light',
  };
  const parts = [`:root{${declarations(light)}}`, `.site-root{${declarations(lightTokens)}}`];
  if (theme.darkMode === 'auto') {
    const dark = darkThemeVariables(theme);
    const darkTokens = {
      '--surface': '#1c1c1b',
      '--surface-2': '#242423',
      '--surface-3': '#2c2c2b',
      '--border': '#2e2e2c',
      '--border-strong': '#41413e',
      '--text-muted': '#a3a29b',
      '--text-subtle': '#7d7c75',
      'color-scheme': 'dark',
    };
    parts.push(
      `@media (prefers-color-scheme: dark){:root{${declarations(dark)}}.site-root{${declarations(darkTokens)}}}`,
    );
  }
  return parts.join('\n');
}

/** Hex colour for <meta name="theme-color">. */
export function themeColor(theme: ThemeSettings): string {
  return hex(theme.primary, '#0b3d91');
}
