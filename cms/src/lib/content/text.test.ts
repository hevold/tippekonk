import { describe, expect, it } from 'vitest';

import {
  docArticleIds,
  docExcerpt,
  docFirstParagraphs,
  docLiveBlogIds,
  docMediaIds,
  docParagraphCount,
  docToPlainText,
  docWordCount,
  readingTimeMinutes,
} from './text';
import type { ContentDoc, ContentNode } from './types';

const p = (text: string): ContentNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const doc: ContentDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tittel' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Første ' },
        { type: 'text', text: 'avsnitt', marks: [{ type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: 'med linjeskift.' },
      ],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p('Punkt en')] },
        { type: 'listItem', content: [p('Punkt to')] },
      ],
    },
    { type: 'factbox', attrs: { title: 'Fakta' }, content: [p('Faktatekst')] },
    { type: 'pullquote', attrs: { cite: 'Ola Vik' }, content: [p('Sitatet')] },
    { type: 'image', attrs: { mediaId: 'm1', caption: 'Bildetekst' } },
    { type: 'gallery', attrs: { items: [{ mediaId: 'm2', caption: 'G' }, { mediaId: 'm1' }] } },
    { type: 'relatedArticles', attrs: { articleIds: ['a1', 'a2'] } },
    { type: 'liveBlog', attrs: { liveBlogId: 'l1' } },
    p('Andre avsnitt.'),
    { type: 'unknownThing', content: [p('Skjult men tekst')] },
  ],
};

describe('docToPlainText', () => {
  it('projects nested nodes to lines', () => {
    const text = docToPlainText(doc);
    expect(text.split('\n')).toEqual([
      'Tittel',
      'Første avsnitt',
      'med linjeskift.',
      'Punkt en',
      'Punkt to',
      'Fakta',
      'Faktatekst',
      'Sitatet',
      'Ola Vik',
      'Bildetekst',
      'G',
      'Andre avsnitt.',
      'Skjult men tekst',
    ]);
  });
  it('handles empty and malformed docs', () => {
    expect(docToPlainText({ type: 'doc', content: [] })).toBe('');
    expect(docToPlainText({ type: 'doc' } as unknown as ContentDoc)).toBe('');
  });
});

describe('docWordCount / readingTimeMinutes', () => {
  it('counts words', () => {
    expect(docWordCount({ type: 'doc', content: [p('En to tre'), p('fire')] })).toBe(4);
  });
  it('reading time is ceil(words/200), min 1', () => {
    expect(readingTimeMinutes(0)).toBe(1);
    expect(readingTimeMinutes(199)).toBe(1);
    expect(readingTimeMinutes(200)).toBe(1);
    expect(readingTimeMinutes(201)).toBe(2);
    expect(readingTimeMinutes(1000)).toBe(5);
    expect(readingTimeMinutes(Number.NaN)).toBe(1);
  });
});

describe('docExcerpt', () => {
  it('uses paragraph text only, cut at a word boundary', () => {
    const out = docExcerpt(doc, 20);
    expect(out.startsWith('Første avsnitt')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
  it('joins several paragraphs when short', () => {
    expect(docExcerpt({ type: 'doc', content: [p('A.'), p('B.')] })).toBe('A. B.');
  });
});

describe('id extraction', () => {
  it('collects media ids from images and galleries, de-duplicated', () => {
    expect(docMediaIds(doc)).toEqual(['m1', 'm2']);
  });
  it('collects article and live blog ids', () => {
    expect(docArticleIds(doc)).toEqual(['a1', 'a2']);
    expect(docLiveBlogIds(doc)).toEqual(['l1']);
  });
});

describe('docFirstParagraphs', () => {
  it('cuts after the Nth paragraph, keeping preceding blocks', () => {
    const teaser = docFirstParagraphs(doc, 1);
    expect(teaser.content.map((n) => n.type)).toEqual(['heading', 'paragraph']);
    const two = docFirstParagraphs(doc, 2);
    expect(two.content[two.content.length - 1]).toEqual(p('Andre avsnitt.'));
    expect(docParagraphCount(doc)).toBe(2);
  });
  it('handles zero and oversize counts', () => {
    expect(docFirstParagraphs(doc, 0).content).toEqual([]);
    expect(docFirstParagraphs(doc, 99).content).toHaveLength(doc.content.length);
  });
});
