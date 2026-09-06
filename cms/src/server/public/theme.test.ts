import { describe, expect, it } from 'vitest';

import { parseSiteSettings } from '@/lib/validation/site';

import {
  darkThemeVariables,
  hexToRgb,
  lighten,
  luminance,
  themeColor,
  themeCss,
  themeVariables,
} from './theme';

describe('theme', () => {
  it('maps settings.theme to --site-* variables', () => {
    const { theme } = parseSiteSettings({
      theme: {
        primary: '#0b3d91',
        accent: '#d9291c',
        radius: 'lg',
        contentWidth: 1100,
        fontHeading: 'sans',
        fontBody: 'serif',
      },
    });
    const vars = themeVariables(theme);
    expect(vars['--site-primary']).toBe('#0b3d91');
    expect(vars['--site-accent']).toBe('#d9291c');
    expect(vars['--site-bg']).toBe('#ffffff');
    expect(vars['--site-text']).toBe('#111111');
    expect(vars['--site-radius']).toBe('14px');
    expect(vars['--site-content-width']).toBe('1100px');
    expect(vars['--site-font-heading']).toContain('--font-sans');
    expect(vars['--site-font-body']).toContain('--font-serif');
    expect(themeColor(theme)).toBe('#0b3d91');
  });

  it('emits a dark override only when darkMode is auto', () => {
    const off = themeCss(parseSiteSettings({}).theme);
    expect(off).toContain(':root{--site-primary:#0b3d91;');
    expect(off).toContain('.site-root{--bg:var(--site-bg);');
    expect(off).toContain('color-scheme:light');
    expect(off).not.toContain('prefers-color-scheme: dark');

    const auto = themeCss(parseSiteSettings({ theme: { darkMode: 'auto' } }).theme);
    expect(auto).toContain('@media (prefers-color-scheme: dark){:root{--site-primary:');
    expect(auto).toContain('--site-bg:#141413');
    expect(auto).toContain('color-scheme:dark');
    // dark primary is lightened for contrast on a dark background
    expect(darkThemeVariables(parseSiteSettings({}).theme)['--site-primary']).not.toBe('#0b3d91');
    expect(
      darkThemeVariables(parseSiteSettings({ theme: { primary: '#ffcc00' } }).theme)['--site-primary'],
    ).toBe('#ffcc00');
  });

  it('colour helpers', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#0b3d91')).toEqual({ r: 11, g: 61, b: 145 });
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(lighten('#000000', 0.5)).toBe('#808080');
  });

  it('never emits anything but whitelisted tokens', () => {
    const css = themeCss({ ...parseSiteSettings({}).theme, primary: 'red; } body { display:none' as never });
    expect(css).not.toContain('display:none');
    expect(css).toContain('--site-primary:#0b3d91');
  });
});
