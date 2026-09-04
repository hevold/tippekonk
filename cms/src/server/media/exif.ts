/**
 * Minimal EXIF reader for the two things the newsroom needs from a photo
 * before its metadata is stripped for privacy: when it was taken and how it
 * is oriented. Pure module (Buffer only), so it is unit-testable without
 * sharp. Everything else in the EXIF block (GPS, camera serial, …) is
 * deliberately ignored and never stored.
 *
 * The parser walks IFD0 and the Exif sub-IFD of a TIFF structure, with or
 * without the "Exif\0\0" APP1 prefix that sharp returns from `metadata().exif`.
 * Malformed input never throws; missing fields come back as null.
 */
import { fromOsloParts } from '@/lib/dates';

export type ExifSummary = {
  /** EXIF orientation 1–8, or null when absent. */
  orientation: number | null;
  /** DateTimeOriginal (falling back to DateTimeDigitized, then DateTime), or null. */
  takenAt: Date | null;
  /** The raw "YYYY:MM:DD HH:MM:SS" string the date came from, for the exif column. */
  dateTimeOriginal: string | null;
  /** Timezone offset string such as "+02:00" when the camera wrote one. */
  offsetTime: string | null;
};

const TAG_ORIENTATION = 0x0112;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME = 0x9010;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

/** Upper bound on entries per IFD; real files have < 100. Guards against garbage counts. */
const MAX_ENTRIES = 512;

type Reader = {
  buf: Buffer;
  le: boolean;
  u16(offset: number): number;
  u32(offset: number): number;
};

function makeReader(buf: Buffer, le: boolean): Reader {
  return {
    buf,
    le,
    u16: (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)),
    u32: (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o)),
  };
}

function readAscii(r: Reader, offset: number, count: number): string | null {
  if (offset < 0 || offset + count > r.buf.length) return null;
  const raw = r.buf.subarray(offset, offset + count).toString('latin1');
  const end = raw.indexOf('\0');
  return (end >= 0 ? raw.slice(0, end) : raw).trim() || null;
}

type Entry = { tag: number; type: number; count: number; valueOffset: number };

function readIfd(r: Reader, offset: number): Entry[] {
  if (offset < 0 || offset + 2 > r.buf.length) return [];
  const count = r.u16(offset);
  if (count > MAX_ENTRIES) return [];
  const entries: Entry[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = offset + 2 + i * 12;
    if (at + 12 > r.buf.length) break;
    entries.push({ tag: r.u16(at), type: r.u16(at + 2), count: r.u32(at + 4), valueOffset: at + 8 });
  }
  return entries;
}

function entryValueOffset(r: Reader, e: Entry): number {
  const size = (TYPE_SIZES[e.type] ?? 1) * e.count;
  // Values of four bytes or less are stored inline; larger ones are pointed to.
  return size <= 4 ? e.valueOffset : r.u32(e.valueOffset);
}

function asciiValue(r: Reader, e: Entry): string | null {
  if (e.type !== 2 || e.count === 0 || e.count > 64) return null;
  return readAscii(r, entryValueOffset(r, e), e.count);
}

function shortValue(r: Reader, e: Entry): number | null {
  if (e.type === 3 && e.count >= 1) return r.u16(e.valueOffset);
  if (e.type === 4 && e.count >= 1) return r.u32(e.valueOffset);
  return null;
}

/** Parse "YYYY:MM:DD HH:MM:SS" (+ optional "+HH:MM" offset) into a Date. Without an offset, the wall clock is read as Europe/Oslo. */
export function parseExifDate(value: string | null | undefined, offset?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  ) {
    return null;
  }
  const off = offset ? /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim()) : null;
  let date: Date;
  if (off) {
    const sign = off[1] === '-' ? -1 : 1;
    const minutes = sign * (Number(off[2]) * 60 + Number(off[3]));
    date = new Date(Date.UTC(year, month - 1, day, hour, minute, second) - minutes * 60_000);
  } else {
    date = fromOsloParts({ year, month, day, hour, minute, second });
  }
  if (Number.isNaN(date.getTime())) return null;
  // Cameras with a dead battery write 2000-01-01 or the Unix epoch; treat anything before digital photography as unknown.
  if (date.getUTCFullYear() < 1990 || date.getTime() > Date.now() + 366 * 24 * 3600_000) return null;
  return date;
}

/** Summarise a raw EXIF blob. Accepts the APP1 payload with or without the "Exif\0\0" prefix. */
export function readExifSummary(exif: Buffer | Uint8Array | null | undefined): ExifSummary {
  const empty: ExifSummary = { orientation: null, takenAt: null, dateTimeOriginal: null, offsetTime: null };
  if (!exif || exif.length < 8) return empty;
  let buf = Buffer.isBuffer(exif) ? exif : Buffer.from(exif);
  if (buf.subarray(0, 6).toString('latin1') === 'Exif\0\0') buf = buf.subarray(6);
  if (buf.length < 8) return empty;

  const order = buf.subarray(0, 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return empty;
  const r = makeReader(buf, order === 'II');
  if (r.u16(2) !== 42) return empty;
  const ifd0Offset = r.u32(4);
  if (ifd0Offset < 8 || ifd0Offset >= buf.length) return empty;

  let orientation: number | null = null;
  let dateTime: string | null = null;
  let exifIfdOffset: number | null = null;

  for (const e of readIfd(r, ifd0Offset)) {
    if (e.tag === TAG_ORIENTATION) {
      const v = shortValue(r, e);
      if (v !== null && v >= 1 && v <= 8) orientation = v;
    } else if (e.tag === TAG_DATETIME) {
      dateTime = asciiValue(r, e);
    } else if (e.tag === TAG_EXIF_IFD) {
      const v = shortValue(r, e);
      if (v !== null && v > 0 && v < buf.length) exifIfdOffset = v;
    }
  }

  let original: string | null = null;
  let digitized: string | null = null;
  let offsetTime: string | null = null;
  let offsetTimeOriginal: string | null = null;
  if (exifIfdOffset !== null) {
    for (const e of readIfd(r, exifIfdOffset)) {
      if (e.tag === TAG_DATETIME_ORIGINAL) original = asciiValue(r, e);
      else if (e.tag === TAG_DATETIME_DIGITIZED) digitized = asciiValue(r, e);
      else if (e.tag === TAG_OFFSET_TIME) offsetTime = asciiValue(r, e);
      else if (e.tag === TAG_OFFSET_TIME_ORIGINAL) offsetTimeOriginal = asciiValue(r, e);
    }
  }

  const candidates: [string | null, string | null][] = [
    [original, offsetTimeOriginal ?? offsetTime],
    [digitized, offsetTime],
    [dateTime, offsetTime],
  ];
  for (const [value, off] of candidates) {
    const date = parseExifDate(value, off);
    if (date) return { orientation, takenAt: date, dateTimeOriginal: value, offsetTime: off };
  }
  return { orientation, takenAt: null, dateTimeOriginal: null, offsetTime: null };
}
