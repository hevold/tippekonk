import { describe, expect, it } from 'vitest';

import { contentDocSchema, isEmptyDoc, isSafeHref, MAX_DEPTH, MAX_NODES, sanitizeDoc } from './schema';
import type { ContentNode } from './types';

const p = (text: string, marks?: ContentNode['marks']): ContentNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('isSafeHref', () => {
  it('allows http(s), mailto, tel and relative', () => {
    expect(isSafeHref('https://nrk.no')).toBe(true);
    expect(isSafeHref('http://example.com/a?b=c')).toBe(true);
    expect(isSafeHref('mailto:tips@elvebyen.no')).toBe(true);
    expect(isSafeHref('tel:+4712345678')).toBe(true);
    expect(isSafeHref('/nyheter/sak')).toBe(true);
    expect(isSafeHref('#anker')).toBe(true);
    expect(isSafeHref('sak-uten-skjema')).toBe(true);
  });
  it('rejects script-ish and odd schemes', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html;base64,AAAA')).toBe(false);
    expect(isSafeHref('vbscript:x')).toBe(false);
    expect(isSafeHref('file:///etc/passwd')).toBe(false);
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref(42)).toBe(false);
  });
});

describe('sanitizeDoc', () => {
  it('returns EMPTY_DOC for garbage and never throws', () => {
    expect(sanitizeDoc(null)).toEqual({ type: 'doc', content: [] });
    expect(sanitizeDoc('string')).toEqual({ type: 'doc', content: [] });
    expect(sanitizeDoc({ type: 'paragraph' })).toEqual({ type: 'doc', content: [] });
    expect(sanitizeDoc({ type: 'doc', content: 'nope' })).toEqual({ type: 'doc', content: [] });
    expect(sanitizeDoc({ type: 'doc', content: [null, 1, 'x', {}] })).toEqual({ type: 'doc', content: [] });
  });

  it('strips javascript: link hrefs but keeps text', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [p('klikk', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])],
    });
    expect(doc.content[0]?.content?.[0]).toEqual({ type: 'text', text: 'klikk' });
  });

  it('keeps safe links and normalises target/rel', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        p('les', [
          {
            type: 'link',
            attrs: { href: ' https://nrk.no ', target: '_blank', onclick: 'x()', class: 'evil' },
          },
          { type: 'bold', attrs: { foo: 1 } },
        ]),
      ],
    });
    const marks = doc.content[0]?.content?.[0]?.marks;
    expect(marks).toEqual([
      { type: 'link', attrs: { href: 'https://nrk.no', target: '_blank', rel: 'noopener noreferrer' } },
      { type: 'bold' },
    ]);
  });

  it('drops unknown marks and duplicate marks', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        p('x', [{ type: 'evil' }, { type: 'italic' }, { type: 'italic' }] as unknown as ContentNode['marks']),
      ],
    });
    expect(doc.content[0]?.content?.[0]?.marks).toEqual([{ type: 'italic' }]);
  });

  it('strips unknown attrs on known nodes and coerces enums', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { textAlign: 'justify', style: 'color:red' }, content: [] },
        { type: 'heading', attrs: { level: 1, id: 'x' }, content: [{ type: 'text', text: 'T' }] },
        { type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'T' }] },
      ],
    });
    expect(doc.content[0]).toEqual({ type: 'paragraph' });
    expect(doc.content[1]?.attrs).toEqual({ level: 2 });
    expect(doc.content[2]?.attrs).toEqual({ level: 4 });
  });

  it('keeps unknown node types but strips their attrs', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [{ type: 'customWidget', attrs: { html: '<script>' }, content: [p('inner')] }],
    });
    expect(doc.content[0]).toEqual({ type: 'customWidget', content: [p('inner')] });
  });

  it('bounds recursion depth', () => {
    let node: Record<string, unknown> = p('deep');
    for (let i = 0; i < MAX_DEPTH + 10; i++) node = { type: 'blockquote', content: [node] };
    const doc = sanitizeDoc({ type: 'doc', content: [node] });
    let depth = 0;
    let cursor: ContentNode | undefined = doc.content[0];
    while (cursor) {
      depth += 1;
      cursor = cursor.content?.[0];
    }
    expect(depth).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('bounds node count', () => {
    const content = Array.from({ length: MAX_NODES + 500 }, () => p('x'));
    const doc = sanitizeDoc({ type: 'doc', content });
    let count = 0;
    const walk = (n: ContentNode) => {
      count += 1;
      n.content?.forEach(walk);
    };
    doc.content.forEach(walk);
    expect(count).toBeLessThanOrEqual(MAX_NODES);
  });

  it('validates image, embed, related and live nodes', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { mediaId: 'm1', src: 'javascript:x', alt: 'A', size: 'huge', width: '640', onload: 'x' },
        },
        { type: 'image', attrs: { alt: 'no media, no src' } },
        { type: 'image', attrs: { src: 'data:image/png;base64,AAA' } },
        { type: 'embed', attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } },
        { type: 'embed', attrs: { provider: 'youtube', url: 'https://example.org/x' } },
        { type: 'embed', attrs: { url: 'javascript:alert(1)' } },
        { type: 'relatedArticles', attrs: { articleIds: ['a', 'a', 1, '', 'b'] } },
        { type: 'liveBlog', attrs: {} },
        { type: 'liveBlog', attrs: { liveBlogId: 'l1', extra: true } },
        { type: 'gallery', attrs: { items: [{ mediaId: 'g1', caption: 'c' }, { nope: 1 }, 'x'] } },
      ],
    });
    expect(doc.content).toHaveLength(6);
    expect(doc.content[0]).toEqual({ type: 'image', attrs: { mediaId: 'm1', alt: 'A', width: 640 } });
    expect(doc.content[1]?.attrs).toMatchObject({
      provider: 'youtube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      aspect: '16:9',
    });
    expect(doc.content[2]?.attrs).toMatchObject({ provider: 'generic', url: 'https://example.org/x' });
    expect(doc.content[3]).toEqual({ type: 'relatedArticles', attrs: { articleIds: ['a', 'b'] } });
    expect(doc.content[4]).toEqual({ type: 'liveBlog', attrs: { liveBlogId: 'l1' } });
    expect(doc.content[5]).toEqual({ type: 'gallery', attrs: { items: [{ mediaId: 'g1', caption: 'c' }] } });
  });

  it('drops empty text nodes and text on non-text nodes', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          text: 'stray',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'ok', content: [p('x')] },
          ],
        },
      ],
    });
    expect(doc.content[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] });
  });
});

describe('contentDocSchema', () => {
  it('parses and sanitises', () => {
    const out = contentDocSchema.parse({
      type: 'doc',
      content: [p('hei', [{ type: 'link', attrs: { href: 'javascript:1' } }])],
    });
    expect(out).toEqual({ type: 'doc', content: [p('hei')] });
  });
  it('rejects non-documents', () => {
    expect(contentDocSchema.safeParse({ type: 'paragraph' }).success).toBe(false);
    expect(contentDocSchema.safeParse('x').success).toBe(false);
    expect(contentDocSchema.safeParse({ type: 'doc', content: {} }).success).toBe(false);
  });
  it('rejects oversized documents', () => {
    const content = Array.from({ length: MAX_NODES + 1 }, () => ({ type: 'paragraph' }));
    expect(contentDocSchema.safeParse({ type: 'doc', content }).success).toBe(false);
  });
});

describe('isEmptyDoc', () => {
  it('detects visually empty docs', () => {
    expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [p('  ')] })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [p('x')] })).toBe(false);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'image', attrs: { mediaId: 'm' } }] })).toBe(false);
  });
});
