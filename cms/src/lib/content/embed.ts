/**
 * Embed whitelist and URL normalisation.
 *
 * `embedInfo(url)` classifies a pasted URL into a provider and, for the
 * providers we render as iframes (YouTube, Vimeo, NRK), computes a stable
 * privacy-friendly embed URL. Everything else becomes a link card — the
 * renderer never executes third-party scripts or raw HTML.
 */
import type { EmbedProvider } from './types';

export type EmbedAspect = '16:9' | '4:3' | '1:1';

export type EmbedInfo = {
  provider: EmbedProvider;
  /** Present only for providers rendered as an iframe. */
  embedUrl?: string;
  aspect: EmbedAspect;
};

export const EMBED_PROVIDERS: EmbedProvider[] = [
  'youtube',
  'vimeo',
  'nrk',
  'x',
  'instagram',
  'facebook',
  'tiktok',
  'spotify',
  'soundcloud',
  'generic',
];

/** Display names for link cards and the editor. Provider names are proper nouns and not translated. */
export const EMBED_PROVIDER_LABELS: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  nrk: 'NRK',
  x: 'X',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  generic: 'Lenke',
};

export function isEmbedProvider(value: unknown): value is EmbedProvider {
  return typeof value === 'string' && (EMBED_PROVIDERS as string[]).includes(value);
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{5,15}$/;
/** NRK programme IDs, e.g. NNFA43000117, DVFJ64001019, KOID75000117. */
const NRK_PRF_ID = /^[A-Z]{4}\d{8}(?:[A-Z]{2})?$/i;

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

function parseUrl(raw: string): URL | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  } catch {
    return null;
  }
}

function youtubeId(u: URL, host: string): string | null {
  const segments = u.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') {
    return segments[0] ?? null;
  }
  if (segments[0] === 'watch') {
    return u.searchParams.get('v');
  }
  if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '')) {
    return segments[1] ?? null;
  }
  return null;
}

function vimeoId(u: URL): string | null {
  const segments = u.pathname.split('/').filter(Boolean);
  // vimeo.com/123, vimeo.com/channels/staffpicks/123, player.vimeo.com/video/123, vimeo.com/123/hash
  for (const s of segments) {
    if (VIMEO_ID.test(s)) return s;
  }
  return null;
}

function nrkId(u: URL): string | null {
  const segments = u.pathname.split('/').filter(Boolean);
  for (const s of segments) {
    if (NRK_PRF_ID.test(s)) return s.toUpperCase();
  }
  return null;
}

/**
 * Classify a URL. Returns null for values that are not http(s) URLs.
 * Unknown hosts map to 'generic' (rendered as a link card).
 */
export function embedInfo(url: string): EmbedInfo | null {
  const u = parseUrl(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');

  if (hostMatches(host, ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'm.youtube.com'])) {
    const id = youtubeId(u, host);
    if (id && YOUTUBE_ID.test(id)) {
      const params = new URLSearchParams({ rel: '0' });
      const start = u.searchParams.get('t') ?? u.searchParams.get('start');
      if (start && /^\d+s?$/.test(start)) params.set('start', start.replace(/s$/, ''));
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
        aspect: '16:9',
      };
    }
    return { provider: 'youtube', aspect: '16:9' };
  }

  if (hostMatches(host, ['vimeo.com'])) {
    const id = vimeoId(u);
    if (id) {
      return { provider: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`, aspect: '16:9' };
    }
    return { provider: 'vimeo', aspect: '16:9' };
  }

  if (hostMatches(host, ['nrk.no'])) {
    const id = nrkId(u);
    if (id) {
      return {
        provider: 'nrk',
        embedUrl: `https://static.nrk.no/ludo/latest/video-embed.html#id=${id}`,
        aspect: '16:9',
      };
    }
    return { provider: 'nrk', aspect: '16:9' };
  }

  if (hostMatches(host, ['x.com', 'twitter.com'])) return { provider: 'x', aspect: '1:1' };
  if (hostMatches(host, ['instagram.com'])) return { provider: 'instagram', aspect: '1:1' };
  if (hostMatches(host, ['facebook.com', 'fb.com', 'fb.watch']))
    return { provider: 'facebook', aspect: '1:1' };
  if (hostMatches(host, ['tiktok.com'])) return { provider: 'tiktok', aspect: '1:1' };
  if (hostMatches(host, ['spotify.com'])) return { provider: 'spotify', aspect: '4:3' };
  if (hostMatches(host, ['soundcloud.com'])) return { provider: 'soundcloud', aspect: '4:3' };

  return { provider: 'generic', aspect: '16:9' };
}

/** Human-readable host for link cards ("nrk.no"). */
export function displayHost(url: string): string {
  const u = parseUrl(url);
  return u ? u.hostname.replace(/^www\./, '') : '';
}
