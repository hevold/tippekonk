import { describe, expect, it } from 'vitest';

import type { Media } from '@/db/schema';
import { parseSiteSettings } from '@/lib/validation/site';

import { articlePath, buildRss, cdata, escapeXml, rfc822 } from './feeds';
import type { FeedArticle } from './queries';

const image: Media = {
  id: 'm1',
  siteId: 's1',
  kind: 'image',
  filename: 'bilde.jpg',
  storageKey: '2026/09/bilde.jpg',
  mime: 'image/jpeg',
  size: 1000,
  width: 1600,
  height: 900,
  duration: null,
  alt: 'Rådhuset & torget',
  caption: null,
  credit: 'Foto: Kari',
  license: null,
  sourceUrl: null,
  focalX: 0.5,
  focalY: 0.5,
  variants: { '1280': { key: '2026/09/bilde-1280.webp', width: 1280, height: 720, format: 'webp', size: 1 } },
  dominantColor: null,
  folder: null,
  tags: [],
  exif: null,
  takenAt: null,
  uploadedBy: null,
  createdAt: new Date('2026-09-01T10:00:00Z'),
  updatedAt: new Date('2026-09-01T10:00:00Z'),
  deletedAt: null,
};

function article(overrides: Partial<FeedArticle> = {}): FeedArticle {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Budsjettet vedtatt: "ny" svømmehall & mer',
    kicker: 'Kommunestyret',
    lead: 'Etter seks timers debatt <ble> budsjettet vedtatt.',
    slug: 'budsjettet-vedtatt',
    sectionSlug: 'nyheter',
    sectionName: 'Nyheter',
    access: 'open',
    publishedAt: new Date('2026-09-03T12:00:00Z'),
    updatedAt: new Date('2026-09-03T13:00:00Z'),
    isBreaking: false,
    isSponsored: false,
    contentTypeKey: 'article',
    featuredMedia: image,
    bylines: [{ name: 'Ingrid Haugen', slug: 'ingrid-haugen' }],
    readingTimeMin: 3,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Brødtekst her.' }] }],
    },
    seoDescription: null,
    tags: ['Budsjett', 'Kommunestyret'],
    bodyMedia: {},
    bodyArticles: {},
    ...overrides,
  };
}

const base = {
  site: { name: 'Elvebyen Tidende', tagline: 'Uavhengig lokalavis', locale: 'nb' },
  baseUrl: 'https://elvebyen.no',
  feedPath: '/rss.xml',
  plusNotice: 'Denne saken er for abonnenter.',
  renderBody: (a: FeedArticle) => `<p>${a.title}</p><p>]]> lukket?</p>`,
  now: new Date('2026-09-04T08:00:00Z'),
};

describe('helpers', () => {
  it('escapes XML special characters and strips control characters', () => {
    expect(escapeXml('a & b < c > "d" \'e\' ')).toBe('a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos; ');
    expect(cdata('x ]]> y')).toBe('<![CDATA[x ]]]]><![CDATA[> y]]>');
    expect(rfc822(new Date('2026-09-03T12:00:00Z'))).toBe('Thu, 03 Sep 2026 12:00:00 GMT');
    expect(articlePath({ id: 'id', slug: 's', sectionSlug: null })).toBe('/a/id');
    expect(articlePath({ id: 'id', slug: 's', sectionSlug: 'nyheter' })).toBe('/nyheter/s');
  });
});

describe('buildRss', () => {
  it('produces a well-formed RSS 2.0 channel with atom:link, dc:creator, categories and media:content', () => {
    const settings = parseSiteSettings({
      editorial: { publisher: 'Elvebyen Tidende AS' },
      contact: { email: 'red@elvebyen.no' },
    });
    const xml = buildRss({ ...base, settings, items: [article()] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(xml).toContain(
      '<atom:link href="https://elvebyen.no/rss.xml" rel="self" type="application/rss+xml"/>',
    );
    expect(xml).toContain('<title>Elvebyen Tidende</title>');
    expect(xml).toContain('<link>https://elvebyen.no/</link>');
    expect(xml).toContain('<language>nb</language>');
    expect(xml).toContain('<copyright>© 2026 Elvebyen Tidende AS</copyright>');
    expect(xml).toContain('<managingEditor>red@elvebyen.no (Elvebyen Tidende)</managingEditor>');
    expect(xml).toContain('<lastBuildDate>Thu, 03 Sep 2026 12:00:00 GMT</lastBuildDate>');
    // item
    expect(xml).toContain(
      '<item><title>Kommunestyret: Budsjettet vedtatt: &quot;ny&quot; svømmehall &amp; mer</title>',
    );
    expect(xml).toContain('<link>https://elvebyen.no/nyheter/budsjettet-vedtatt</link>');
    expect(xml).toContain('<guid isPermaLink="true">https://elvebyen.no/nyheter/budsjettet-vedtatt</guid>');
    expect(xml).toContain('<pubDate>Thu, 03 Sep 2026 12:00:00 GMT</pubDate>');
    expect(xml).toContain(
      '<description>Etter seks timers debatt &lt;ble&gt; budsjettet vedtatt.</description>',
    );
    expect(xml).toContain('<dc:creator>Ingrid Haugen</dc:creator>');
    expect(xml).toContain(
      '<category>Nyheter</category><category>Budsjett</category><category>Kommunestyret</category>',
    );
    expect(xml).toContain(
      '<media:content url="https://elvebyen.no/media/2026/09/bilde-1280.webp" type="image/jpeg" medium="image" width="1600" height="900">',
    );
    expect(xml).toContain('<media:description type="plain">Rådhuset &amp; torget</media:description>');
    expect(xml).toContain('<media:credit role="photographer" scheme="urn:ebu">Foto: Kari</media:credit>');
    // no full content by default
    expect(xml).not.toContain('<content:encoded>');
    // every opened element is closed (cheap well-formedness check)
    for (const tag of ['rss', 'channel', 'item', 'title', 'link', 'description']) {
      expect((xml.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length).toBe(
        (xml.match(new RegExp(`</${tag}>`, 'g')) ?? []).length,
      );
    }
    expect(xml.trim().endsWith('</rss>')).toBe(true);
  });

  it('includes full content in CDATA when feeds.fullContent is on, but never for plus articles', () => {
    const settings = parseSiteSettings({ feeds: { fullContent: true }, paywall: { enabled: true } });
    const xml = buildRss({
      ...base,
      settings,
      items: [
        article(),
        article({ id: '22222222-2222-4222-8222-222222222222', slug: 'pluss', access: 'plus' }),
      ],
    });
    const items = xml.split('<item>').slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain(
      '<content:encoded><![CDATA[<p>Budsjettet vedtatt: "ny" svømmehall & mer</p><p>]]]]><![CDATA[> lukket?</p>]]></content:encoded>',
    );
    expect(items[1]).not.toContain('<content:encoded>');
    expect(items[1]).toContain('Denne saken er for abonnenter.');
  });

  it('builds section feeds with their own title, link and self URL', () => {
    const settings = parseSiteSettings({});
    const xml = buildRss({
      ...base,
      settings,
      feedPath: '/sport/rss.xml',
      section: { name: 'Sport', slug: 'sport', description: null },
      items: [],
    });
    expect(xml).toContain('<title>Elvebyen Tidende – Sport</title>');
    expect(xml).toContain('<link>https://elvebyen.no/sport</link>');
    expect(xml).toContain('<atom:link href="https://elvebyen.no/sport/rss.xml" rel="self"');
    expect(xml).toContain('<description>Siste saker fra Sport i Elvebyen Tidende</description>');
    expect(xml).toContain('<lastBuildDate>Fri, 04 Sep 2026 08:00:00 GMT</lastBuildDate>');
    expect(xml).not.toContain('<item>');
  });
});
