import { describe, expect, it } from 'vitest';

import type { ContentDoc } from '@/lib/content/types';
import { parseSiteSettings } from '@/lib/validation/site';

import {
  allowedTransitions,
  bodyImages,
  canTransition,
  canTrash,
  checklistFlag,
  hasBlockingIssues,
  issuesToFieldErrors,
  validateForPublish,
  type PublishCandidate,
  type PublishMedia,
} from './validation';

const settings = parseSiteSettings({});

const doc = (nodes: ContentDoc['content'] = []): ContentDoc => ({ type: 'doc', content: nodes });

function allChecklistFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const item of settings.checklist.items) flags[checklistFlag(item.id)] = true;
  return flags;
}

function candidate(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
  return {
    title: 'Kommunestyret vedtok budsjettet',
    lead: 'En ingress som oppsummerer saken.',
    sectionId: 'section-1',
    body: doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Brødtekst.' }] }]),
    featuredMediaId: null,
    featuredCredit: null,
    bylines: [{ authorId: 'author-1' }],
    isSponsored: false,
    flags: allChecklistFlags(),
    ...overrides,
  };
}

const media = (rows: PublishMedia[]) => new Map(rows.map((r) => [r.id, r]));

describe('validateForPublish', () => {
  it('passes a complete article', () => {
    expect(validateForPublish(candidate(), settings, media([]))).toEqual([]);
  });

  it('requires title, lead, section and a byline', () => {
    const issues = validateForPublish(
      candidate({ title: '  ', lead: null, sectionId: null, bylines: [] }),
      settings,
      media([]),
    );
    const fields = issues.filter((i) => i.level === 'error').map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'lead', 'sectionId', 'bylines']));
    expect(hasBlockingIssues(issues)).toBe(true);
    expect(issuesToFieldErrors(issues).title?.[0]).toContain('tittel');
  });

  it('warns (does not block) on long titles and leads', () => {
    const issues = validateForPublish(
      candidate({
        title: 'x'.repeat(settings.editor.titleMaxLength + 1),
        lead: 'y'.repeat(settings.editor.leadMaxLength + 1),
      }),
      settings,
      media([]),
    );
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
    expect(issues.map((i) => i.field)).toEqual(['title', 'lead']);
    expect(hasBlockingIssues(issues)).toBe(false);
  });

  it('does not require a lead when the setting is off', () => {
    const relaxed = parseSiteSettings({ editor: { requireLead: false } });
    expect(validateForPublish(candidate({ lead: null }), relaxed, media([]))).toEqual([]);
  });

  it('requires a featured image only when configured', () => {
    const strict = parseSiteSettings({ editor: { requireFeaturedImage: true } });
    expect(validateForPublish(candidate(), settings, media([]))).toEqual([]);
    const issues = validateForPublish(candidate(), strict, media([]));
    expect(issues).toEqual([
      { level: 'error', field: 'featuredMediaId', message: expect.stringContaining('hovedbilde') },
    ]);
  });

  it('blocks on a featured image without alt and warns on missing credit', () => {
    const noAlt = validateForPublish(
      candidate({ featuredMediaId: 'm1' }),
      settings,
      media([{ id: 'm1', alt: null, credit: 'Foto: X' }]),
    );
    expect(noAlt).toEqual([
      { level: 'error', field: 'featuredMediaId', message: expect.stringContaining('alternativ tekst') },
    ]);

    const noCredit = validateForPublish(
      candidate({ featuredMediaId: 'm1' }),
      settings,
      media([{ id: 'm1', alt: 'Bilde', credit: null }]),
    );
    expect(noCredit).toEqual([
      { level: 'warning', field: 'featuredMediaId', message: expect.stringContaining('kreditering') },
    ]);

    // An article-level credit override satisfies the credit rule.
    expect(
      validateForPublish(
        candidate({ featuredMediaId: 'm1', featuredCredit: 'Foto: Y' }),
        settings,
        media([{ id: 'm1', alt: 'Bilde', credit: null }]),
      ),
    ).toEqual([]);

    // A featured image that no longer exists is an error.
    expect(validateForPublish(candidate({ featuredMediaId: 'gone' }), settings, media([]))[0]).toMatchObject({
      level: 'error',
      field: 'featuredMediaId',
    });
  });

  it('checks body images (node attrs or media row) for alt and credit', () => {
    const body = doc([
      { type: 'image', attrs: { mediaId: 'a' } },
      { type: 'image', attrs: { mediaId: 'b', alt: 'Fra noden', credit: 'Foto: node' } },
      { type: 'gallery', attrs: { items: [{ mediaId: 'c' }, { mediaId: 'gone' }] } },
    ]);
    expect(bodyImages(body).map((i) => i.mediaId)).toEqual(['a', 'b', 'c', 'gone']);
    const issues = validateForPublish(
      candidate({ body }),
      settings,
      media([
        { id: 'a', alt: null, credit: null },
        { id: 'b', alt: null, credit: null },
        { id: 'c', alt: 'Galleri', credit: 'Foto: c' },
      ]),
    );
    expect(issues).toEqual([
      { level: 'error', field: 'body', message: expect.stringContaining('finnes ikke lenger') },
      { level: 'error', field: 'body', message: expect.stringContaining('alternativ tekst') },
      { level: 'warning', field: 'body', message: expect.stringContaining('kreditering') },
    ]);
  });

  it('warns about sponsored content', () => {
    const issues = validateForPublish(candidate({ isSponsored: true }), settings, media([]));
    expect(issues).toEqual([{ level: 'warning', field: 'isSponsored', message: expect.any(String) }]);
  });

  it('blocks on unticked required checklist items and ignores optional ones', () => {
    const flags = allChecklistFlags();
    delete flags[checklistFlag('sources')];
    delete flags[checklistFlag('children')]; // optional
    const issues = validateForPublish(candidate({ flags }), settings, media([]));
    expect(issues).toEqual([
      { level: 'error', field: 'checklist.sources', message: expect.stringContaining('Sjekkliste') },
    ]);

    const disabled = parseSiteSettings({ checklist: { enabled: false } });
    expect(validateForPublish(candidate({ flags: {} }), disabled, media([]))).toEqual([]);
  });

  it('rejects a scheduled time in the past', () => {
    const now = new Date('2026-09-06T10:00:00Z');
    expect(
      validateForPublish(
        candidate({ scheduledAt: new Date('2026-09-06T09:59:00Z') }),
        settings,
        media([]),
        [],
        now,
      ),
    ).toEqual([{ level: 'error', field: 'scheduledAt', message: expect.stringContaining('fram i tid') }]);
    expect(
      validateForPublish(
        candidate({ scheduledAt: new Date('2026-09-06T10:01:00Z') }),
        settings,
        media([]),
        [],
        now,
      ),
    ).toEqual([]);
  });

  it('enforces required custom fields of the content type', () => {
    const fields = [
      { key: 'venue', label: 'Sted', type: 'text' as const, required: true, showInList: false },
    ];
    const missing = validateForPublish(candidate({ customFields: {} }), settings, media([]), fields);
    expect(missing).toEqual([{ level: 'error', field: 'customFields.venue', message: 'Sted må fylles ut' }]);
    expect(
      validateForPublish(candidate({ customFields: { venue: 'Kino' } }), settings, media([]), fields),
    ).toEqual([]);
  });
});

describe('workflow state machine', () => {
  it('follows SPEC 5.2', () => {
    expect(canTransition('draft', 'in_review')).toBe(true);
    expect(canTransition('in_review', 'approved')).toBe(true);
    expect(canTransition('approved', 'published')).toBe(true);
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('published', 'unpublished')).toBe(true);
    expect(canTransition('unpublished', 'draft')).toBe(true);
    expect(canTransition('unpublished', 'published')).toBe(true);
    expect(canTransition('published', 'archived')).toBe(false);
    expect(canTransition('published', 'draft')).toBe(false);
    expect(canTransition('archived', 'published')).toBe(false);
    expect(allowedTransitions('published')).toEqual(['unpublished']);
    expect(canTrash('published')).toBe(false);
    expect(canTrash('draft')).toBe(true);
  });
});
