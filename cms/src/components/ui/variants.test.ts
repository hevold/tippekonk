import { describe, expect, it } from 'vitest';

import { avatarTint, initials } from './avatar-helpers';
import {
  ARTICLE_STATUSES,
  BADGE_VARIANTS,
  badgeVariants,
  isArticleStatus,
  statusBadgeClass,
  statusLabelKey,
} from './badge-variants';
import { BUTTON_SIZES, BUTTON_VARIANTS, buttonVariants, iconButtonSize } from './button-variants';
import { isModKey, matchesQuery } from './palette-helpers';

describe('buttonVariants', () => {
  it('produces distinct classes for every variant and size', () => {
    const seen = new Set<string>();
    for (const variant of BUTTON_VARIANTS) {
      for (const size of BUTTON_SIZES) {
        const cls = buttonVariants({ variant, size });
        expect(cls).toContain('inline-flex');
        expect(seen.has(cls)).toBe(false);
        seen.add(cls);
      }
    }
  });

  it('uses the primary variant and md size by default', () => {
    expect(buttonVariants({})).toContain('bg-primary');
    expect(buttonVariants({})).toContain('h-8');
  });

  it('maps semantic tokens, never raw greys', () => {
    for (const variant of BUTTON_VARIANTS) {
      expect(buttonVariants({ variant })).not.toMatch(/gray|slate|zinc|neutral/);
    }
  });

  it('has an icon size for every text size', () => {
    for (const size of BUTTON_SIZES) expect(iconButtonSize[size]).toMatch(/^size-/);
  });
});

describe('badgeVariants / status mapping', () => {
  it('has a class set for every variant', () => {
    for (const variant of BADGE_VARIANTS) expect(badgeVariants({ variant })).toContain('rounded-full');
  });

  it('covers every article status with colour and label key', () => {
    for (const status of ARTICLE_STATUSES) {
      expect(statusBadgeClass[status]).toMatch(/^bg-status-/);
      expect(statusLabelKey(status)).toBe(`common.status.${status}`);
    }
  });

  it('narrows unknown values', () => {
    expect(isArticleStatus('published')).toBe(true);
    expect(isArticleStatus('trash')).toBe(false);
    expect(isArticleStatus(42)).toBe(false);
  });
});

describe('avatar helpers', () => {
  it('builds initials', () => {
    expect(initials('Kari Nordmann')).toBe('KN');
    expect(initials('Marit Solheim-Berg')).toBe('MB');
    expect(initials('NTB')).toBe('NT');
    expect(initials('  ')).toBe('?');
  });

  it('tints deterministically', () => {
    expect(avatarTint('Kari Nordmann')).toBe(avatarTint('Kari Nordmann'));
    expect(avatarTint('Kari Nordmann')).toMatch(/^bg-status-/);
  });
});

describe('palette helpers', () => {
  it('matches every query part against label and keywords', () => {
    const item = { label: 'Mediearkiv', keywords: ['bilder', 'media'] };
    expect(matchesQuery(item, '')).toBe(true);
    expect(matchesQuery(item, 'MEDIA')).toBe(true);
    expect(matchesQuery(item, 'bild arkiv')).toBe(true);
    expect(matchesQuery(item, 'saker')).toBe(false);
  });

  it('detects the mod key', () => {
    expect(isModKey({ metaKey: true, ctrlKey: false, altKey: false, key: 'K' }, 'k')).toBe(true);
    expect(isModKey({ metaKey: false, ctrlKey: true, altKey: false, key: 'k' }, 'k')).toBe(true);
    expect(isModKey({ metaKey: false, ctrlKey: false, altKey: false, key: 'k' }, 'k')).toBe(false);
    expect(isModKey({ metaKey: true, ctrlKey: false, altKey: true, key: 'k' }, 'k')).toBe(false);
  });
});
