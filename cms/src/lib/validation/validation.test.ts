import { describe, expect, it } from 'vitest';

import { articleFilterSchema, articleInputSchema, parseArticleSort } from './article';
import {
  emailSchema,
  hexColorSchema,
  hrefSchema,
  paginationSchema,
  slugSchema,
  urlSchema,
  uuidSchema,
} from './common';
import { customFieldValuesSchema, validateCustomFields } from './custom-fields';
import { liveBlogInputSchema, livePostInputSchema } from './live';
import { mediaMetaSchema } from './media';
import type { FieldDef } from './site';
import { contentTypeInputSchema, sectionInputSchema } from './taxonomy';
import { inviteSchema, loginSchema, passwordSchema, passwordStrengthError } from './user';

const UUID = '3f2c2b8e-3a0d-4d4b-9c1e-2c9f4a0b1d22';

describe('common', () => {
  it('validates ids, slugs, colours, emails, urls', () => {
    expect(uuidSchema.safeParse(UUID).success).toBe(true);
    expect(uuidSchema.safeParse('nope').success).toBe(false);
    expect(slugSchema.safeParse('kommunestyret-2026').success).toBe(true);
    expect(slugSchema.safeParse('Ikke Slug').success).toBe(false);
    expect(hexColorSchema.safeParse('#1d4ed8').success).toBe(true);
    expect(hexColorSchema.safeParse('#fff').success).toBe(true);
    expect(hexColorSchema.safeParse('blue').success).toBe(false);
    expect(emailSchema.parse('  Kari@Elvebyen.NO ')).toBe('kari@elvebyen.no');
    expect(emailSchema.safeParse('kari').success).toBe(false);
    expect(urlSchema.safeParse('https://nrk.no').success).toBe(true);
    expect(urlSchema.safeParse('javascript:1').success).toBe(false);
    expect(hrefSchema.safeParse('/abonnement').success).toBe(true);
    expect(hrefSchema.safeParse('//evil').success).toBe(false);
  });
  it('coerces pagination from strings', () => {
    expect(paginationSchema.parse({ page: '3', perPage: '50' })).toEqual({ page: 3, perPage: 50 });
    expect(paginationSchema.parse({})).toEqual({ page: 1, perPage: 25 });
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('customFieldValuesSchema', () => {
  const fields: FieldDef[] = [
    {
      key: 'standpoint',
      label: 'Standpunkt',
      type: 'select',
      required: true,
      showInList: false,
      options: [
        { value: 'for', label: 'For' },
        { value: 'mot', label: 'Mot' },
      ],
    },
    { key: 'born', label: 'Født', type: 'date', required: false, showInList: false },
    { key: 'startsAt', label: 'Starter', type: 'datetime', required: true, showInList: true },
    { key: 'venue', label: 'Sted', type: 'text', required: false, showInList: false, max: 10 },
    { key: 'ticketUrl', label: 'Billetter', type: 'url', required: false, showInList: false },
    {
      key: 'price',
      label: 'Pris',
      type: 'number',
      required: false,
      showInList: false,
      min: 0,
      max: 1000,
      default: 100,
    },
    { key: 'free', label: 'Gratis', type: 'boolean', required: false, showInList: false },
    {
      key: 'tags',
      label: 'Emner',
      type: 'multiselect',
      required: false,
      showInList: false,
      options: [{ value: 'a', label: 'A' }],
    },
    { key: 'contact', label: 'Kontakt', type: 'email', required: false, showInList: false },
    { key: 'hero', label: 'Bilde', type: 'media', required: false, showInList: false },
    { key: 'summary', label: 'Sammendrag', type: 'richtext', required: false, showInList: false },
  ];

  it('accepts valid values, coerces, applies defaults, drops unknown keys', () => {
    const schema = customFieldValuesSchema(fields);
    const out = schema.parse({
      standpoint: 'for',
      born: '1950-02-01',
      startsAt: '2026-09-10T18:00:00Z',
      venue: 'Kino',
      ticketUrl: 'https://billett.no/x',
      free: 'on',
      tags: 'a',
      contact: 'A@B.NO',
      hero: UUID,
      summary: { type: 'doc', content: [] },
      unknown: 'dropped',
    });
    expect(out).toMatchObject({
      standpoint: 'for',
      venue: 'Kino',
      free: true,
      tags: ['a'],
      contact: 'a@b.no',
      price: 100,
    });
    expect('unknown' in out).toBe(false);
  });

  it('reports required and type errors per field', () => {
    const { errors } = validateCustomFields(fields, {
      standpoint: 'kanskje',
      born: '01.02.1950',
      venue: 'For lang tekst her',
      price: 5000,
      ticketUrl: 'not-a-url',
    });
    expect(errors.standpoint).toContain('ugyldig valg');
    expect(errors.born).toBeDefined();
    expect(errors.startsAt).toBe('Starter må fylles ut');
    expect(errors.venue).toBeDefined();
    expect(errors.price).toBeDefined();
    expect(errors.ticketUrl).toBeDefined();
  });

  it('treats empty strings as missing', () => {
    const { errors, values } = validateCustomFields(fields, { standpoint: '', startsAt: '', born: '' });
    expect(errors.standpoint).toBe('Standpunkt må fylles ut');
    expect(errors.startsAt).toBeDefined();
    expect(values).toEqual({});
    const ok = validateCustomFields(fields, { standpoint: 'mot', startsAt: '2026-09-10T18:00', born: '' });
    expect(ok.errors).toEqual({});
    expect('born' in ok.values).toBe(false);
  });
});

describe('articleInputSchema', () => {
  it('fills defaults and normalises', () => {
    const out = articleInputSchema.parse({
      title: '  Tittel ',
      slug: 'Min-Slug',
      kicker: '',
      body: { type: 'doc', content: [] },
    });
    expect(out.title).toBe('Tittel');
    expect(out.slug).toBe('min-slug');
    expect(out.kicker).toBeNull();
    expect(out.access).toBe('open');
    expect(out.tagIds).toEqual([]);
    expect(out.body).toEqual({ type: 'doc', content: [] });
    expect(out.isBreaking).toBe(false);
  });
  it('rejects bad slugs and ids', () => {
    expect(articleInputSchema.safeParse({ slug: 'Ikke gyldig!' }).success).toBe(false);
    expect(articleInputSchema.safeParse({ sectionId: 'x' }).success).toBe(false);
    expect(articleInputSchema.safeParse({ bylines: [{ authorId: UUID }] }).success).toBe(true);
  });
  it('sanitises the body', () => {
    const out = articleInputSchema.parse({
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'javascript:1' } }] },
            ],
          },
        ],
      },
    });
    expect(out.body.content[0]?.content?.[0]?.marks).toBeUndefined();
  });
  it('parses filters from search params', () => {
    const f = articleFilterSchema.parse({
      status: 'draft',
      q: 'budsjett',
      page: '2',
      sort: '-publishedAt',
      sectionId: '',
    });
    expect(f).toMatchObject({ status: 'draft', q: 'budsjett', page: 2, perPage: 25, sort: '-publishedAt' });
    expect(f.sectionId).toBeUndefined();
    expect(parseArticleSort('-publishedAt')).toEqual({ field: 'publishedAt', direction: 'desc' });
    expect(parseArticleSort('bogus')).toEqual({ field: 'updatedAt', direction: 'asc' });
    expect(articleFilterSchema.safeParse({ sort: 'evil' }).success).toBe(false);
  });
});

describe('taxonomy', () => {
  it('rejects reserved section slugs and requires names', () => {
    expect(sectionInputSchema.safeParse({ name: 'Admin', slug: 'admin' }).success).toBe(false);
    expect(sectionInputSchema.safeParse({ name: '', slug: '' }).success).toBe(false);
    const ok = sectionInputSchema.parse({ name: 'Nyheter', color: '', showInMenu: 'on' });
    expect(ok).toMatchObject({ slug: '', color: null, showInMenu: true, isActive: true });
  });
  it('enforces unique custom field keys and options for selects', () => {
    const base = { key: 'event', name: 'Arrangement' };
    const dup = contentTypeInputSchema.safeParse({
      ...base,
      fields: [
        { key: 'venue', label: 'Sted', type: 'text' },
        { key: 'venue', label: 'Sted 2', type: 'text' },
      ],
    });
    expect(dup.success).toBe(false);
    expect(dup.error?.issues[0]?.path).toEqual(['fields', 1, 'key']);
    const noOptions = contentTypeInputSchema.safeParse({
      ...base,
      fields: [{ key: 'kind', label: 'Type', type: 'select' }],
    });
    expect(noOptions.success).toBe(false);
    expect(contentTypeInputSchema.safeParse({ ...base, key: 'Bad Key' }).success).toBe(false);
    const ok = contentTypeInputSchema.parse({
      ...base,
      fields: [{ key: 'venue', label: 'Sted', type: 'text' }],
    });
    expect(ok.template).toBe('article');
    expect(ok.fields[0]).toMatchObject({ required: false, showInList: false });
  });
});

describe('user', () => {
  it('shares the password strength rule', () => {
    expect(passwordStrengthError('kort1')).toContain('minst 10');
    expect(passwordStrengthError('bareBokstaver')).toContain('tall');
    expect(passwordStrengthError('1234567890')).toContain('bokstav');
    expect(passwordStrengthError('Elvebyen2026!')).toBeNull();
    expect(passwordSchema.safeParse('Elvebyen2026!').success).toBe(true);
    expect(passwordSchema.safeParse('short').success).toBe(false);
  });
  it('validates login and invite payloads', () => {
    expect(loginSchema.parse({ email: 'A@B.NO', password: 'x', next: '/admin/artikler' })).toMatchObject({
      email: 'a@b.no',
      remember: false,
      next: '/admin/artikler',
    });
    expect(loginSchema.safeParse({ email: 'a@b.no', password: 'x', next: 'https://evil' }).success).toBe(
      false,
    );
    expect(inviteSchema.parse({ email: 'a@b.no', name: 'Kari' })).toMatchObject({
      role: 'journalist',
      createAuthor: true,
    });
    expect(inviteSchema.safeParse({ email: 'a@b.no', name: 'Kari', role: 'king' }).success).toBe(false);
  });
});

describe('media and live', () => {
  it('normalises media metadata', () => {
    const out = mediaMetaSchema.parse({
      alt: ' Alt ',
      tags: 'Sport, sport ,Kultur',
      focalX: '0.25',
      takenAt: '',
    });
    expect(out).toMatchObject({
      alt: 'Alt',
      tags: ['sport', 'kultur'],
      focalX: 0.25,
      focalY: 0.5,
      takenAt: null,
    });
    expect(mediaMetaSchema.safeParse({ focalX: 2 }).success).toBe(false);
  });
  it('validates live blogs and posts', () => {
    expect(liveBlogInputSchema.parse({ title: 'Kommunestyret direkte' })).toMatchObject({
      slug: '',
      status: 'draft',
    });
    const empty = livePostInputSchema.safeParse({ liveBlogId: UUID, body: { type: 'doc', content: [] } });
    expect(empty.success).toBe(false);
    const ok = livePostInputSchema.safeParse({
      liveBlogId: UUID,
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Møtet er i gang' }] }],
      },
      isKeyEvent: 'true',
    });
    expect(ok.success).toBe(true);
    expect(ok.data?.isKeyEvent).toBe(true);
  });
});
