import { describe, expect, it } from 'vitest';

import { displayHost, embedInfo } from './embed';

describe('embedInfo', () => {
  it('normalises YouTube URLs', () => {
    const expected = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0';
    expect(embedInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: expected,
      aspect: '16:9',
    });
    expect(embedInfo('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(expected);
    expect(embedInfo('https://youtube.com/shorts/dQw4w9WgXcQ?feature=share')?.embedUrl).toBe(expected);
    expect(embedInfo('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x')?.embedUrl).toBe(expected);
    expect(embedInfo('https://www.youtube.com/embed/dQw4w9WgXcQ')?.embedUrl).toBe(expected);
    expect(embedInfo('https://www.youtube.com/live/dQw4w9WgXcQ')?.embedUrl).toBe(expected);
  });

  it('keeps a start time', () => {
    expect(embedInfo('https://youtu.be/dQw4w9WgXcQ?t=42s')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42',
    );
  });

  it('classifies YouTube without an id as provider without embedUrl', () => {
    const info = embedInfo('https://www.youtube.com/channel/UC123');
    expect(info).toEqual({ provider: 'youtube', aspect: '16:9' });
  });

  it('normalises Vimeo URLs', () => {
    expect(embedInfo('https://vimeo.com/123456789')).toEqual({
      provider: 'vimeo',
      embedUrl: 'https://player.vimeo.com/video/123456789?dnt=1',
      aspect: '16:9',
    });
    expect(embedInfo('https://vimeo.com/channels/staffpicks/123456789')?.embedUrl).toBe(
      'https://player.vimeo.com/video/123456789?dnt=1',
    );
    expect(embedInfo('https://player.vimeo.com/video/123456789?h=abc')?.embedUrl).toBe(
      'https://player.vimeo.com/video/123456789?dnt=1',
    );
  });

  it('handles NRK programme ids', () => {
    expect(embedInfo('https://tv.nrk.no/serie/dagsrevyen/202609/NNFA19090426/avspiller')).toEqual({
      provider: 'nrk',
      embedUrl: 'https://static.nrk.no/ludo/latest/video-embed.html#id=NNFA19090426',
      aspect: '16:9',
    });
    expect(embedInfo('https://www.nrk.no/video/kommunestyret_123456')).toEqual({
      provider: 'nrk',
      aspect: '16:9',
    });
  });

  it('maps social providers to link cards', () => {
    expect(embedInfo('https://x.com/nrk/status/1')?.provider).toBe('x');
    expect(embedInfo('https://twitter.com/nrk/status/1')?.provider).toBe('x');
    expect(embedInfo('https://www.instagram.com/p/abc/')?.provider).toBe('instagram');
    expect(embedInfo('https://www.facebook.com/nrk/posts/1')?.provider).toBe('facebook');
    expect(embedInfo('https://www.tiktok.com/@nrk/video/1')?.provider).toBe('tiktok');
    expect(embedInfo('https://open.spotify.com/track/abc')?.provider).toBe('spotify');
    expect(embedInfo('https://soundcloud.com/a/b')?.provider).toBe('soundcloud');
    for (const url of ['https://x.com/nrk/status/1', 'https://open.spotify.com/track/abc']) {
      expect(embedInfo(url)?.embedUrl).toBeUndefined();
    }
  });

  it('treats unknown hosts as generic and rejects non-http', () => {
    expect(embedInfo('https://example.org/artikkel')).toEqual({ provider: 'generic', aspect: '16:9' });
    expect(embedInfo('example.org/artikkel')).toEqual({ provider: 'generic', aspect: '16:9' });
    expect(embedInfo('javascript:alert(1)')).toBeNull();
    expect(embedInfo('ftp://example.org/x')).toBeNull();
    expect(embedInfo('')).toBeNull();
    expect(embedInfo('not a url at all')).toBeNull();
  });

  it('does not match look-alike hosts', () => {
    expect(embedInfo('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')?.provider).toBe('generic');
    expect(embedInfo('https://notvimeo.com/123456789')?.provider).toBe('generic');
  });

  it('displayHost strips www', () => {
    expect(displayHost('https://www.nrk.no/x')).toBe('nrk.no');
    expect(displayHost('nope')).toBe('nope');
    expect(displayHost('javascript:1')).toBe('');
  });
});
