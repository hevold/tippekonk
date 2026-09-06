import { describe, expect, it } from 'vitest';

import { parseSiteSettings } from '@/lib/validation/site';

import {
  breadcrumbJsonLd,
  newsArticleJsonLd,
  organizationJsonLd,
  serializeJsonLd,
  webSiteJsonLd,
  type SiteInfo,
} from './json-ld';
import type { PublicArticle } from './queries';

const info: SiteInfo = {
  site: { name: 'Elvebyen Tidende', tagline: 'Uavhengig lokalavis' },
  settings: parseSiteSettings({
    social: { facebook: 'https://www.facebook.com/elvebyen', x: '' },
    contact: { address: 'Storgata 12', postalCode: '9999', city: 'Elvebyen', email: 'red@elvebyen.no' },
    editorial: { publisher: 'Elvebyen Tidende AS', editorialPolicyUrl: '/om' },
  }),
  baseUrl: 'https://elvebyen.no',
  logo: null,
};

function article(overrides: Partial<PublicArticle> = {}): PublicArticle {
  return {
    id: 'a1',
    siteId: 's1',
    status: 'published',
    title: 'Budsjettet vedtatt </script><b>x</b>',
    kicker: null,
    lead: 'Ingress',
    slug: 'budsjettet-vedtatt',
    body: { type: 'doc', content: [] },
    bodyText: '',
    access: 'open',
    section: {
      id: 'sec',
      siteId: 's1',
      parentId: null,
      name: 'Nyheter',
      slug: 'nyheter',
      description: null,
      color: null,
      sortOrder: 0,
      showInMenu: true,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    contentType: { id: 'ct', key: 'article', name: 'Artikkel', template: 'article' },
    featuredMedia: null,
    featuredCaption: null,
    featuredCredit: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    noIndex: false,
    isBreaking: false,
    isSponsored: false,
    customFields: {},
    publishedAt: new Date('2026-09-03T12:00:00Z'),
    firstPublishedAt: new Date('2026-09-03T11:00:00Z'),
    updatedAt: new Date('2026-09-03T13:00:00Z'),
    wordCount: 420,
    readingTimeMin: 3,
    createdBy: null,
    tags: [{ id: 't1', name: 'Budsjett', slug: 'budsjett' }],
    bylines: [
      {
        id: 'b1',
        name: 'Ingrid Haugen',
        slug: 'ingrid-haugen',
        title: 'Journalist',
        role: 'text',
        image: null,
      },
      { id: 'b2', name: 'Foto Person', slug: 'foto-person', title: null, role: 'photo', image: null },
    ],
    related: [],
    bodyMedia: {},
    bodyArticles: {},
    bodyLiveBlogs: {},
    ...overrides,
  };
}

describe('json-ld builders', () => {
  it('NewsArticle carries the SPEC fields', () => {
    const ld = newsArticleJsonLd(article(), info, {
      url: 'https://elvebyen.no/nyheter/budsjettet-vedtatt',
      paywalled: false,
    });
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.headline).toBe('Budsjettet vedtatt </script><b>x</b>');
    expect(ld.datePublished).toBe('2026-09-03T11:00:00.000Z');
    expect(ld.dateModified).toBe('2026-09-03T13:00:00.000Z');
    expect(ld.author).toEqual([
      { '@type': 'Person', name: 'Ingrid Haugen', url: 'https://elvebyen.no/skribent/ingrid-haugen' },
    ]);
    expect(ld.publisher).toMatchObject({
      '@type': 'NewsMediaOrganization',
      name: 'Elvebyen Tidende',
      '@id': 'https://elvebyen.no/#organization',
    });
    expect(ld.articleSection).toBe('Nyheter');
    expect(ld.isAccessibleForFree).toBe(true);
    expect(ld.keywords).toBe('Budsjett');
    expect(ld.wordCount).toBe(420);
    expect(ld.mainEntityOfPage).toEqual({
      '@type': 'WebPage',
      '@id': 'https://elvebyen.no/nyheter/budsjettet-vedtatt',
    });
    expect(ld.image).toBeUndefined();
  });

  it('marks paywalled and opinion articles', () => {
    const ld = newsArticleJsonLd(
      article({
        access: 'plus',
        contentType: { id: 'ct', key: 'opinion', name: 'Kommentar', template: 'opinion' },
      }),
      info,
      {
        url: 'https://elvebyen.no/x',
        paywalled: true,
      },
    );
    expect(ld['@type']).toBe('OpinionNewsArticle');
    expect(ld.isAccessibleForFree).toBe(false);
    expect(ld.hasPart).toEqual({
      '@type': 'WebPageElement',
      isAccessibleForFree: false,
      cssSelector: '.paywalled',
    });
  });

  it('Organization, WebSite (with SearchAction) and BreadcrumbList', () => {
    const org = organizationJsonLd(info);
    expect(org['@type']).toBe('NewsMediaOrganization');
    expect(org.sameAs).toEqual(['https://www.facebook.com/elvebyen']);
    expect(org.address).toMatchObject({
      '@type': 'PostalAddress',
      streetAddress: 'Storgata 12',
      addressLocality: 'Elvebyen',
      addressCountry: 'NO',
    });
    expect(org.ethicsPolicy).toBe('https://elvebyen.no/om');
    expect(org.parentOrganization).toEqual({ '@type': 'Organization', name: 'Elvebyen Tidende AS' });

    const site = webSiteJsonLd(info);
    expect(site['@type']).toBe('WebSite');
    expect(site.potentialAction).toEqual({
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://elvebyen.no/sok?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    });

    const crumbs = breadcrumbJsonLd([
      { name: 'Forsiden', url: 'https://elvebyen.no/' },
      { name: 'Nyheter', url: 'https://elvebyen.no/nyheter' },
    ]);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Forsiden', item: 'https://elvebyen.no/' },
      { '@type': 'ListItem', position: 2, name: 'Nyheter', item: 'https://elvebyen.no/nyheter' },
    ]);
  });

  it('serializeJsonLd escapes "<" so content cannot close the script tag', () => {
    const out = serializeJsonLd(newsArticleJsonLd(article(), info, { url: 'u', paywalled: false }));
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script>');
    expect(JSON.parse(out).headline).toBe('Budsjettet vedtatt </script><b>x</b>');
  });
});
