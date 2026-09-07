import { describe, expect, it } from 'vitest';

import type { Media } from '@/db/schema';
import type { ArticleTeaser } from '@/lib/layout/engine';

import { docToFeedHtml, docToHtml, escapeHtml, type FeedHtmlContext } from './html';
import { emptyRenderContext, type RenderContext } from './render';
import type { ContentDoc, ContentNode } from './types';

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

const liveBlogs = new Map([
  [
    'l1',
    {
      id: 'l1',
      title: 'Møtet direkte',
      slug: 'motet-direkte',
      description: null,
      status: 'live' as const,
      startedAt: null,
      updatedAt: new Date(),
    },
  ],
]);

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  return emptyRenderContext({
    media: new Map([['m1', media]]),
    articles: new Map([['a1', teaser]]),
    ...overrides,
  });
}

function feedCtx(overrides: Partial<FeedHtmlContext> = {}): FeedHtmlContext {
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

describe('docToHtml', () => {
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
        { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p('tre')] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('punkt')] }] },
        { type: 'blockquote', content: [p('sitat')] },
        { type: 'pullquote', attrs: { cite: 'Ordføreren' }, content: [p('Uthevet')] },
        { type: 'horizontalRule' },
        { type: 'factbox', attrs: { title: 'Fakta' }, content: [p('Innhold')] },
      ],
    };
    const html = docToHtml(doc, ctx());
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
      '<aside class="factbox" aria-label="Fakta"><h3 class="factbox-title">Fakta</h3><p>Innhold</p></aside>',
    );
  });

  it('keeps only safe links, applies linkResolver and puts the link outermost', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        p('trygg', [{ type: 'bold' }, { type: 'link', attrs: { href: '/nyheter/sak', target: '_blank' } }]),
        p('farlig', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        p('ekstern', [{ type: 'link', attrs: { href: 'https://nrk.no/?a=1&b="2"' } }]),
      ],
    };
    const html = docToHtml(doc, ctx({ linkResolver: (h) => (h.startsWith('/') ? `https://x.no${h}` : h) }));
    expect(html).toContain(
      '<a href="https://x.no/nyheter/sak" target="_blank" rel="noopener noreferrer"><strong>trygg</strong></a>',
    );
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<p>farlig</p>');
    expect(html).toContain('<a href="https://nrk.no/?a=1&amp;b=&quot;2&quot;">ekstern</a>');
  });

  it('renders images with srcset, dimensions, caption and credit; drops unsafe and unknown images', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        { type: 'image', attrs: { mediaId: 'm1', caption: 'Egen tekst', size: 'wide' } },
        { type: 'image', attrs: { mediaId: 'missing', src: '/media/x.jpg', alt: 'Alt' } },
        { type: 'image', attrs: { mediaId: 'missing', src: 'data:image/png;base64,AAAA' } },
        { type: 'image', attrs: { mediaId: 'missing', src: 'javascript:alert(1)' } },
        { type: 'image', attrs: { mediaId: 'missing' } },
        { type: 'gallery', attrs: { items: [{ mediaId: 'm1', caption: 'G1' }, { mediaId: 'nei' }, null] } },
      ],
    };
    const html = docToHtml(doc, ctx());
    expect(html).toContain(
      '<figure class="article-image" data-size="wide"><img src="/media/2026/09/bilde-1280.webp" srcset="/media/2026/09/bilde-640.webp 640w, /media/2026/09/bilde-1280.webp 1280w" sizes="(min-width: 1024px) 720px, 100vw" alt="Rådhuset &quot;i&quot; Elvebyen" width="1600" height="900" loading="lazy" decoding="async"/>',
    );
    expect(html).toContain(
      '<figcaption><span class="caption">Egen tekst</span> <span class="credit">Foto: Kari &amp; co</span></figcaption>',
    );
    expect(html).toContain('<img src="/media/x.jpg" alt="Alt" loading="lazy" decoding="async"/>');
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('javascript:');
    expect((html.match(/<figure/g) ?? []).length).toBe(3);
    expect(html).toContain('<div class="gallery" role="group" aria-label="Bildegalleri"><figure>');
    expect(html).toContain('<span class="caption">G1</span>');
  });

  it('renders iframe embeds for video providers, link cards otherwise, and never embed html', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'embed', attrs: { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Klipp' } },
        { type: 'embed', attrs: { provider: 'x', url: 'https://x.com/nrk/status/1' } },
        { type: 'embed', attrs: { provider: 'generic', url: 'https://example.org', html: '<script>alert(1)</script>' } },
        { type: 'embed', attrs: { url: 'javascript:alert(1)' } },
      ],
    } as ContentDoc;
    const html = docToHtml(doc, ctx());
    expect(html).toContain('<figure class="embed embed-youtube" data-aspect="16:9">');
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" title="Klipp"');
    expect(html).toMatch(/sandbox="allow-scripts allow-same-origin[^"]*"/);
    expect(html).toContain('<figcaption>Klipp</figcaption>');
    expect(html).toContain(
      '<div class="embed embed-card-wrap embed-x"><a class="embed-card" href="https://x.com/nrk/status/1" target="_blank" rel="noopener noreferrer nofollow"><span class="embed-card-provider">X</span>',
    );
    expect(html).toContain('<span class="embed-card-url">example.org</span>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    expect(docToHtml(doc, ctx({ embeds: 'placeholder' }))).not.toContain('<iframe');
  });

  it('renders tables, related articles and live blogs like renderDoc', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [p('Kolonne')] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [p('Verdi')] }] },
          ],
        },
        { type: 'relatedArticles', attrs: { articleIds: ['a1', 'ukjent'] } },
        { type: 'relatedArticles', attrs: { articleIds: ['ukjent'] } },
        { type: 'liveBlog', attrs: { liveBlogId: 'l1' } },
        { type: 'liveBlog', attrs: { liveBlogId: 'ukjent' } },
        { type: 'ukjentNode', content: [p('bevart')] },
        { type: 'text' } as ContentNode,
        null as unknown as ContentNode,
      ],
    };
    const html = docToHtml(doc, ctx({ liveBlogs }));
    expect(html).toContain(
      '<div class="table-wrap"><table><thead><tr><th scope="col"><p>Kolonne</p></th></tr></thead><tbody><tr><td colspan="2"><p>Verdi</p></td></tr></tbody></table></div>',
    );
    expect(html).toContain(
      '<aside class="related" aria-label="Les også"><h3 class="related-title">Les også</h3><ul><li><a href="/nyheter/relatert-sak"><span class="related-kicker">Nyheter </span>Relatert &lt;sak&gt;</a></li></ul></aside>',
    );
    expect((html.match(/class="related"/g) ?? []).length).toBe(1);
    expect(html).toContain(
      '<aside class="live-blog-embed" data-live-blog-id="l1" data-live-status="live"><a href="/direkte/motet-direkte"><span class="live-blog-label">Direkte</span><span class="live-blog-title">Møtet direkte</span></a></aside>',
    );
    expect(html).toContain(
      '<aside class="live-blog-embed" data-live-blog-id="ukjent"><span class="live-blog-label">Direkte</span></aside>',
    );
    expect(html).toContain('<div><p>bevart</p></div>');
  });

  it('never throws on garbage', () => {
    expect(docToHtml(null as unknown as ContentDoc, ctx())).toBe('');
    expect(docToHtml({ type: 'doc', content: 'nei' as unknown as ContentNode[] }, ctx())).toBe('');
    expect(docToHtml({ type: 'doc' } as unknown as ContentDoc, ctx())).toBe('');
  });
});

describe('docToFeedHtml', () => {
  it('makes every URL absolute and renders embeds as link cards', () => {
    const doc: ContentDoc = {
      type: 'doc',
      content: [
        p('lenke', [{ type: 'link', attrs: { href: '/nyheter/sak' } }]),
        p('ekstern', [{ type: 'link', attrs: { href: 'https://nrk.no/' } }]),
        { type: 'image', attrs: { mediaId: 'm1' } },
        { type: 'image', attrs: { src: '/media/x.jpg', alt: 'Alt' } },
        { type: 'embed', attrs: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Klipp' } },
        { type: 'relatedArticles', attrs: { articleIds: ['a1'] } },
        { type: 'liveBlog', attrs: { liveBlogId: 'l1' } },
      ],
    };
    const html = docToFeedHtml(doc, feedCtx({ liveBlogs, imageWidth: 640 }));
    expect(html).toContain('<a href="https://elvebyen.no/nyheter/sak">lenke</a>');
    expect(html).toContain('<a href="https://nrk.no/">ekstern</a>');
    expect(html).toContain(
      '<img src="https://elvebyen.no/media/2026/09/bilde-640.webp" srcset="https://elvebyen.no/media/2026/09/bilde-640.webp 640w, https://elvebyen.no/media/2026/09/bilde-1280.webp 1280w"',
    );
    expect(html).toContain('<img src="https://elvebyen.no/media/x.jpg" alt="Alt"');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('<a class="embed-card" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('<span class="embed-card-title">Klipp</span>');
    expect(html).toContain('<a href="https://elvebyen.no/nyheter/relatert-sak">');
    expect(html).toContain('<a href="https://elvebyen.no/direkte/motet-direkte">');
    expect(html).not.toMatch(/(href|src)="\//);
  });
});
