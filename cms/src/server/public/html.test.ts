import { describe, expect, it } from 'vitest';

import type { Media } from '@/db/schema';
import type { ContentDoc, ContentNode } from '@/lib/content/types';
import type { ArticleTeaser } from '@/lib/layout/engine';

import { docToFeedHtml, escapeHtml, type FeedHtmlContext } from './html';

const media = {
  id: 'm1',
  kind: 'image',
  storageKey: '2026/09/bilde.jpg',
  mime: 'image/jpeg',
  width: 1600,
  height: 900,
  alt: 'Rådhuset "i" Elvebyen',
  caption: 'Rådhuset',
  credit: 'Foto: Kari & co',
  variants: {
    '640': { key: '2026/09/bilde-640.webp', width: 640, height: 360, format: 'webp', size: 1 },
    '1280': { key: '2026/09/bilde-1280.webp', width: 1280, height: 720, format: 'webp', size: 1 },
  },
  focalX: 0.5,
  focalY: 0.5,
  dominantColor: null,
  deletedAt: null,
} as unknown as Media;

const teaser = {
  id: 'a1',
  title: 'Relatert <sak>',
  kicker: 'Nyheter',
  slug: 'relatert-sak',
  sectionSlug: 'nyheter',
} as unknown as ArticleTeaser;

function ctx(overrides: Partial<FeedHtmlContext> = {}): FeedHtmlContext {
  return {
    baseUrl: 'https://elvebyen.no',
    media: new Map([['m1', media]]),
    articles: new Map([['a1', teaser]]),
    ...overrides,
  };
}

function p(text: string, marks?: ContentNode['marks']): ContentNode {
  return { type: 'paragraph', content: [{ type: 'text', text, marks }] };
}

describe('escapeHtml', () => {
  it('escapes the five special characters', () => {
    expect(escapeHtml(`a & b < c > "d" 'e'`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});

describe('docToFeedHtml', () => {
  it('renders paragraphs, headings, lists, quotes and marks with escaped text', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tittel <b>' }] },
        { type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'H2 igjen' }] },
        p('Fet', [{ type: 'bold' }]),
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Midt', marks: [{ type: 'italic' }, { type: 'highlight' }] }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b', marks: [{ type: 'code' }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [{ type: 'listItem', content: [p('tre')] }],
        },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('punkt')] }] },
        { type: 'blockquote', content: [p('sitat')] },
        { type: 'pullquote', attrs: { cite: 'Ordføreren' }, content: [p('Uthevet')] },
        { type: 'horizontalRule' },
        { type: 'factbox', attrs: { title: 'Fakta' }, content: [p('Innhold')] },
      ],
    };
    const html = docToFeedHtml(doc, ctx());
    expect(html).toContain('<h2>Tittel &lt;b&gt;</h2><h2>H2 igjen</h2>');
    expect(html).toContain('<p><strong>Fet</strong></p>');
    expect(html).toContain('<p style="text-align:center"><mark><em>Midt</em></mark></p>');
    expect(html).toContain('<p>a<br/><code>b</code></p>');
    expect(html).toContain('<ol start="3"><li><p>tre</p></li></ol>');
    expect(html).toContain('<ul><li><p>punkt</p></li></ul>');
    expect(html).toContain('<blockquote><p>sitat</p></blockquote>');
    expect(html).toContain(
      '<figure class="pullquote"><blockquote><p>Uthevet</p></blockquote><figcaption>Ordføreren</figcaption></figure>',
    );
    expect(html).toContain('<hr/>');
    expect(html).toContain(
      '<aside class="factbox"><h3 class="factbox-title">Fakta</h3><p>Innhold</p></aside>',
    );
  });

  it('keeps only safe links, makes them absolute and puts the link outermost', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        p('trygg', [{ type: 'bold' }, { type: 'link', attrs: { href: '/nyheter/sak', target: '_blank' } }]),
        p('farlig', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        p('ekstern', [{ type: 'link', attrs: { href: 'https://nrk.no/?a=1&b="2"' } }]),
      ],
    };
    const html = docToFeedHtml(doc, ctx());
    expect(html).toContain(
      '<a href="https://elvebyen.no/nyheter/sak" target="_blank" rel="noopener noreferrer"><strong>trygg</strong></a>',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<p>farlig</p>');
    expect(html).toContain('<a href="https://nrk.no/?a=1&amp;b=&quot;2&quot;">ekstern</a>');
  });

  it('renders images with absolute variant URLs, dimensions, caption and credit; drops unknown images', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { mediaId: 'm1', caption: 'Egen tekst', size: 'wide' } },
        { type: 'image', attrs: { mediaId: 'missing', src: '/media/x.jpg', alt: 'Alt' } },
        { type: 'image', attrs: { mediaId: 'missing', src: 'data:image/png;base64,AAAA' } },
        { type: 'image', attrs: { mediaId: 'missing' } },
        {
          type: 'gallery',
          attrs: { items: [{ mediaId: 'm1', caption: 'G1' }, { mediaId: 'nei' }, null] },
        },
      ],
    };
    const html = docToFeedHtml(doc, ctx());
    expect(html).toContain(
      '<figure class="article-image" data-size="wide"><img src="https://elvebyen.no/media/2026/09/bilde-1280.webp" alt="Rådhuset &quot;i&quot; Elvebyen" width="1600" height="900"/>',
    );
    expect(html).toContain(
      '<figcaption><span class="caption">Egen tekst</span> <span class="credit">Foto: Kari &amp; co</span></figcaption>',
    );
    expect(html).toContain('<img src="https://elvebyen.no/media/x.jpg" alt="Alt"/>');
    expect(html).not.toContain('data:image');
    expect((html.match(/<figure/g) ?? []).length).toBe(3);
    expect(html).toContain('<div class="gallery"><figure>');
    expect(html).toContain('<span class="caption">G1</span>');
  });

  it('renders embeds as link cards, tables, related articles and live blogs', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'embed', attrs: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Klipp' } },
        { type: 'embed', attrs: { url: 'javascript:alert(1)' } },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [p('Kolonne')] }] },
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [p('Verdi')] }],
            },
          ],
        },
        { type: 'relatedArticles', attrs: { articleIds: ['a1', 'ukjent'] } },
        { type: 'liveBlog', attrs: { liveBlogId: 'l1' } },
        { type: 'liveBlog', attrs: { liveBlogId: 'ukjent' } },
        { type: 'ukjentNode', content: [p('bevart')] },
        { type: 'text' } as ContentNode,
        null as unknown as ContentNode,
      ],
    };
    const html = docToFeedHtml(
      doc,
      ctx({
        liveBlogs: new Map([
          [
            'l1',
            {
              id: 'l1',
              title: 'Møtet direkte',
              slug: 'motet-direkte',
              description: null,
              status: 'live',
              startedAt: null,
              updatedAt: new Date(),
            },
          ],
        ]),
      }),
    );
    expect(html).toContain(
      '<p class="embed embed-youtube"><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" rel="noopener noreferrer nofollow">YouTube: Klipp</a></p>',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain(
      '<table><thead><tr><th scope="col"><p>Kolonne</p></th></tr></thead><tbody><tr><td colspan="2"><p>Verdi</p></td></tr></tbody></table>',
    );
    expect(html).toContain(
      '<aside class="related"><h3 class="related-title">Les også</h3><ul><li><a href="https://elvebyen.no/nyheter/relatert-sak"><span class="related-kicker">Nyheter </span>Relatert &lt;sak&gt;</a></li></ul></aside>',
    );
    expect(html).toContain(
      '<p class="live-blog-embed"><a href="https://elvebyen.no/direkte/motet-direkte">Direkte: Møtet direkte</a></p>',
    );
    expect((html.match(/live-blog-embed/g) ?? []).length).toBe(1);
    expect(html).toContain('<div><p>bevart</p></div>');
  });

  it('never throws on garbage', () => {
    expect(docToFeedHtml(null as unknown as ContentDoc, ctx())).toBe('');
    expect(docToFeedHtml({ type: 'doc', content: 'nei' as unknown as ContentNode[] }, ctx())).toBe('');
  });
});
