import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { baseUrlFor } from './urls';

const site = { domains: ['elvebyen.no', 'localhost'] };

describe('baseUrlFor', () => {
  it('echoes the request host when it is one of the site domains', () => {
    expect(baseUrlFor(site, 'elvebyen.no', 'https')).toBe('https://elvebyen.no');
    expect(baseUrlFor(site, 'www.elvebyen.no', null)).toBe('https://www.elvebyen.no');
    expect(baseUrlFor(site, 'localhost:3000', null)).toBe('http://localhost:3000');
  });

  it('never echoes an unknown Host header (cache poisoning of canonical links, feeds, sitemap)', () => {
    expect(baseUrlFor(site, 'evil.example', 'https')).toBe('https://elvebyen.no');
    expect(baseUrlFor(site, 'elvebyen.no.evil.example', 'https')).toBe('https://elvebyen.no');
    expect(baseUrlFor({ domains: ['localhost'] }, 'evil.example', null)).toBe('http://localhost:3000');
  });

  it('falls back to the first real domain, then APP_URL, without a request', () => {
    expect(baseUrlFor(site, null, null)).toBe('https://elvebyen.no');
    expect(baseUrlFor({ domains: ['127.0.0.1'] }, null, null)).toBe('http://localhost:3000');
  });
});
