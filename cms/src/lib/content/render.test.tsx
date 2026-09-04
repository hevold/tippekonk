import { describe, expect, it, vi } from 'vitest';

import type { Media } from '@/db/schema';
import type { ArticleTeaser } from '@/lib/layout/engine';

// INTEGRATION: the real <MediaImage> lives in the media area; here a plain <img> stands in.
vi.mock('@/components/media/media-image', () => ({
  MediaImage: ({ media, sizes }: { media: { storageKey: string; alt: string | null }; sizes?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/media/${media.storageKey}`} alt={media.alt ?? ''} sizes={sizes} data-media-image />
  ),
}));

import { docToHtml } from './html';
import { emptyRenderContext, type RenderContext } from './render';
import type { ContentDoc, ContentNode } from './types';

const p = (text: string, marks?: ContentNode['marks']): ContentNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

const media = {
  id: 'm1',
  storageKey: '2026/09/m1.jpg',
  alt: 'Rådhuset i Elvebyen',
  caption: 'Rådhuset',
  credit: 'Foto: Kari Nordmann',
  variants: {},
  kind: 'image',
  focalX: 0.5,
  focalY: 0.5,
} as unknown as Media;

const teaser = {
  id: 'a1',
  title: 'Budsjettet vedtatt',
  kicker: 'Politikk',
  slug: 'budsjettet-vedtatt',
  sectionSlug: 'nyheter',
} as unknown as ArticleTeaser;

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  return emptyRenderContext({
    media: new Map([['m1', media]]),
    articles: new Map([['a1', teaser]]),
    ...overrides,
  });
}

describe('docToHtml', () => {
  it('renders paragraphs, headings, marks and escapes text', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tittel <b>' }] },
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
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<h2>Tittel &lt;b&gt;</h2>');
    expect(html).toContain('<strong>Fet</strong>');
    expect(html).toContain('<p style="text-align:center"><mark><em>Midt</em></mark></p>');
    expect(html).toContain('<br/>');
    expect(html).toContain('<code>b</code>');
  });

  it('renders safe links only, with rel for new tabs and linkResolver applied', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        p('trygg', [{ type: 'bold' }, { type: 'link', attrs: { href: '/nyheter/sak', target: '_blank' } }]),
        p('farlig', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      ],
    };
    const html = docToHtml(
      doc,
      ctx({ linkResolver: (h) => (h.startsWith('/') ? `https://elvebyen.no${h}` : h) }),
    );
    expect(html).toContain(
      '<a href="https://elvebyen.no/nyheter/sak" target="_blank" rel="noopener noreferrer"><strong>trygg</strong></a>',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('farlig');
  });

  it('renders figures with figcaption, caption and credit', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { mediaId: 'm1', caption: 'Egen bildetekst', size: 'wide' } }],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<figure class="article-image" data-size="wide">');
    expect(html).toContain('data-media-image');
    expect(html).toContain(
      '<figcaption><span class="caption">Egen bildetekst</span> <span class="credit">Foto: Kari Nordmann</span></figcaption>',
    );
  });

  it('falls back to src for images without a media row and skips images with neither', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { mediaId: 'missing', src: 'https://example.org/a.jpg', alt: 'Alt' } },
        { type: 'image', attrs: { mediaId: 'missing' } },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<img src="https://example.org/a.jpg" alt="Alt"');
    expect((html.match(/<figure/g) ?? []).length).toBe(1);
  });

  it('renders a gallery', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'gallery', attrs: { items: [{ mediaId: 'm1', caption: 'En' }, { mediaId: 'nope' }] } },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<div class="gallery" role="group"');
    expect((html.match(/<figure>/g) ?? []).length).toBe(1);
  });

  it('renders YouTube as a sandboxed iframe', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        {
          type: 'embed',
          attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Klipp' },
        },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<figure class="embed embed-youtube" data-aspect="16:9">');
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"');
    expect(html).toMatch(/sandbox="allow-scripts allow-same-origin[^"]*"/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<figcaption>Klipp</figcaption>');
  });

  it('renders generic and social embeds as link cards, and everything as cards in placeholder mode', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'embed', attrs: { provider: 'generic', url: 'https://example.org/artikkel' } },
        { type: 'embed', attrs: { provider: 'x', url: 'https://x.com/nrk/status/1' } },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).not.toContain('<iframe');
    expect(html).toContain(
      '<a class="embed-card" href="https://example.org/artikkel" target="_blank" rel="noopener noreferrer nofollow">',
    );
    expect(html).toContain('<span class="embed-card-provider">X</span>');
    expect(html).toContain('example.org');

    const yt: ContentDoc = {
      type: 'doc',
      content: [{ type: 'embed', attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' } }],
    };
    expect(docToHtml(yt, ctx({ embeds: 'placeholder' }))).not.toContain('<iframe');
  });

  it('never renders embed html attributes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'embed',
          attrs: { provider: 'generic', url: 'https://example.org', html: '<script>alert(1)</script>' },
        },
      ],
    } as ContentDoc;
    expect(docToHtml(doc, ctx())).not.toContain('<script>');
  });

  it('renders factbox, pullquote, lists, blockquote and hr', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'factbox', attrs: { title: 'Fakta om saken' }, content: [p('Innhold')] },
        { type: 'pullquote', attrs: { cite: 'Ola Vik' }, content: [p('Sitat')] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('En')] }] },
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p('Tre')] }] },
        { type: 'blockquote', content: [p('Q')] },
        { type: 'horizontalRule' },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain(
      '<aside class="factbox" aria-label="Fakta om saken"><h3 class="factbox-title">Fakta om saken</h3><p>Innhold</p></aside>',
    );
    expect(html).toContain(
      '<figure class="pullquote"><blockquote><p>Sitat</p></blockquote><figcaption>Ola Vik</figcaption></figure>',
    );
    expect(html).toContain('<ul><li><p>En</p></li></ul>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<blockquote><p>Q</p></blockquote>');
    expect(html).toContain('<hr/>');
  });

  it('renders tables with header rows and spans', () => {
    const cell = (
      type: 'tableHeader' | 'tableCell',
      text: string,
      attrs?: Record<string, unknown>,
    ): ContentNode => ({
      type,
      attrs,
      content: [p(text)],
    });
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
            { type: 'tableRow', content: [cell('tableCell', '1', { colspan: 2 })] },
          ],
        },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<div class="table-wrap"><table><thead><tr><th scope="col">');
    expect(html).toContain('<td colSpan="2">');
  });

  it('renders related articles from the context and skips unknown ids', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [{ type: 'relatedArticles', attrs: { articleIds: ['a1', 'unknown'] } }],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain(
      '<aside class="related" aria-label="Les også"><h3 class="related-title">Les også</h3>',
    );
    expect(html).toContain(
      '<a href="/nyheter/budsjettet-vedtatt"><span class="related-kicker">Politikk </span>Budsjettet vedtatt</a>',
    );
    expect((html.match(/<li>/g) ?? []).length).toBe(1);
    const none: ContentDoc = {
      type: 'doc',
      content: [{ type: 'relatedArticles', attrs: { articleIds: ['unknown'] } }],
    };
    expect(docToHtml(none, ctx())).toBe('');
  });

  it('renders live blog embeds with and without a summary', () => {
    const doc: ContentDoc = { type: 'doc', content: [{ type: 'liveBlog', attrs: { liveBlogId: 'l1' } }] };
    expect(docToHtml(doc, ctx())).toContain('<aside class="live-blog-embed" data-live-blog-id="l1">');
    const withSummary = ctx({
      liveBlogs: new Map([
        [
          'l1',
          {
            id: 'l1',
            title: 'Kommunestyret direkte',
            slug: 'kommunestyret',
            description: null,
            status: 'live',
            startedAt: null,
            updatedAt: new Date(),
          },
        ],
      ]),
    });
    const html = docToHtml(doc, withSummary);
    expect(html).toContain('href="/direkte/kommunestyret"');
    expect(html).toContain('Kommunestyret direkte');
  });

  it('renders unknown nodes as their children and survives malformed input', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'weird', attrs: { onclick: 'x' }, content: [p('inner')] },
        null,
        { type: 42 },
        { type: 'text' },
      ],
    } as unknown as ContentDoc;
    const html = docToHtml(doc, ctx());
    expect(html).toBe('<div><p>inner</p></div>');
    expect(docToHtml({ type: 'doc' } as unknown as ContentDoc, ctx())).toBe('');
  });
});
