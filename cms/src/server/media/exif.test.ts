import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { parseExifDate, readExifSummary } from './exif';

/** Build a minimal little-endian TIFF/EXIF blob with IFD0 { Orientation, DateTime, ExifIFD → { DateTimeOriginal, OffsetTimeOriginal } }. */
function buildExif(opts: {
  orientation?: number;
  dateTime?: string;
  original?: string;
  offset?: string;
  prefix?: boolean;
}): Buffer {
  const strings: { tag: number; value: string }[] = [];
  const ifd0: { tag: number; type: number; count: number; value: number | string }[] = [];
  if (opts.orientation) ifd0.push({ tag: 0x0112, type: 3, count: 1, value: opts.orientation });
  if (opts.dateTime)
    ifd0.push({ tag: 0x0132, type: 2, count: opts.dateTime.length + 1, value: opts.dateTime });
  const exifEntries: typeof ifd0 = [];
  if (opts.original)
    exifEntries.push({ tag: 0x9003, type: 2, count: opts.original.length + 1, value: opts.original });
  if (opts.offset)
    exifEntries.push({ tag: 0x9011, type: 2, count: opts.offset.length + 1, value: opts.offset });
  const hasExifIfd = exifEntries.length > 0;
  if (hasExifIfd) ifd0.push({ tag: 0x8769, type: 4, count: 1, value: 0 });
  ifd0.sort((a, b) => a.tag - b.tag);

  const ifd0Offset = 8;
  const ifd0Size = 2 + ifd0.length * 12 + 4;
  const exifOffset = ifd0Offset + ifd0Size;
  const exifSize = hasExifIfd ? 2 + exifEntries.length * 12 + 4 : 0;
  let dataOffset = exifOffset + exifSize;

  const buf = Buffer.alloc(512);
  buf.write('II', 0, 'latin1');
  buf.writeUInt16LE(42, 2);
  buf.writeUInt32LE(ifd0Offset, 4);

  const writeIfd = (entries: typeof ifd0, at: number) => {
    buf.writeUInt16LE(entries.length, at);
    entries.forEach((e, i) => {
      const p = at + 2 + i * 12;
      buf.writeUInt16LE(e.tag, p);
      buf.writeUInt16LE(e.type, p + 2);
      buf.writeUInt32LE(e.count, p + 4);
      if (e.type === 2 && typeof e.value === 'string') {
        buf.writeUInt32LE(dataOffset, p + 8);
        buf.write(`${e.value}\0`, dataOffset, 'latin1');
        strings.push({ tag: e.tag, value: e.value });
        dataOffset += e.count;
      } else if (e.tag === 0x8769) {
        buf.writeUInt32LE(exifOffset, p + 8);
      } else if (e.type === 3) {
        buf.writeUInt16LE(Number(e.value), p + 8);
      } else {
        buf.writeUInt32LE(Number(e.value), p + 8);
      }
    });
    buf.writeUInt32LE(0, at + 2 + entries.length * 12);
  };
  writeIfd(ifd0, ifd0Offset);
  if (hasExifIfd) writeIfd(exifEntries, exifOffset);
  const body = buf.subarray(0, dataOffset);
  return opts.prefix ? Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), body]) : body;
}

describe('parseExifDate', () => {
  it('reads camera wall-clock time as Europe/Oslo when no offset is present', () => {
    const d = parseExifDate('2026:07:15 14:30:00');
    expect(d?.toISOString()).toBe('2026-07-15T12:30:00.000Z'); // CEST = UTC+2
    const winter = parseExifDate('2026:01:15 14:30:00');
    expect(winter?.toISOString()).toBe('2026-01-15T13:30:00.000Z'); // CET = UTC+1
  });

  it('honours an explicit offset', () => {
    expect(parseExifDate('2026:07:15 14:30:00', '-05:00')?.toISOString()).toBe('2026-07-15T19:30:00.000Z');
  });

  it('rejects garbage, dead-battery dates and far-future dates', () => {
    expect(parseExifDate('0000:00:00 00:00:00')).toBeNull();
    expect(parseExifDate('1970:01:01 00:00:00')).toBeNull();
    expect(parseExifDate('not a date')).toBeNull();
    expect(parseExifDate('2999:01:01 00:00:00')).toBeNull();
    expect(parseExifDate(null)).toBeNull();
  });
});

describe('readExifSummary', () => {
  it('returns empty values for missing or malformed input', () => {
    expect(readExifSummary(null)).toEqual({
      orientation: null,
      takenAt: null,
      dateTimeOriginal: null,
      offsetTime: null,
    });
    expect(readExifSummary(Buffer.from('hello world'))).toMatchObject({ orientation: null, takenAt: null });
    expect(readExifSummary(Buffer.from('II*\0\xff\xff\xff\xff', 'latin1'))).toMatchObject({
      orientation: null,
    });
  });

  it('reads orientation and DateTimeOriginal (with the APP1 prefix sharp returns)', () => {
    const exif = buildExif({
      orientation: 6,
      dateTime: '2026:01:01 10:00:00',
      original: '2025:12:24 17:05:09',
      offset: '+01:00',
      prefix: true,
    });
    const summary = readExifSummary(exif);
    expect(summary.orientation).toBe(6);
    expect(summary.dateTimeOriginal).toBe('2025:12:24 17:05:09');
    expect(summary.offsetTime).toBe('+01:00');
    expect(summary.takenAt?.toISOString()).toBe('2025-12-24T16:05:09.000Z');
  });

  it('falls back to IFD0 DateTime when the Exif IFD has no original date', () => {
    const summary = readExifSummary(buildExif({ orientation: 1, dateTime: '2026:03:03 08:00:00' }));
    expect(summary.orientation).toBe(1);
    expect(summary.takenAt?.toISOString()).toBe('2026-03-03T07:00:00.000Z');
  });

  it('reads EXIF written by sharp into a real JPEG', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } })
      .jpeg()
      .withMetadata({ orientation: 3 })
      .withExifMerge({
        IFD0: { DateTime: '2026:05:05 12:00:00' },
        IFD2: { DateTimeOriginal: '2026:05:04 09:30:00' },
      })
      .toBuffer();
    const meta = await sharp(jpeg).metadata();
    expect(meta.exif).toBeInstanceOf(Buffer);
    const summary = readExifSummary(meta.exif);
    expect(summary.orientation).toBe(3);
    expect(summary.takenAt?.toISOString()).toBe('2026-05-04T07:30:00.000Z');
  });
});
