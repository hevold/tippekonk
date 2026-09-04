/**
 * Placeholder images for the seed. Each image is rendered by sharp from an
 * SVG (1600×1000, distinct gradient, caption text baked in), stored as JPEG
 * under UPLOAD_DIR with the same key layout the media area uses
 * ("2026/09/<uuid>.jpg"), plus WebP variants at 320/640/960/1280 px
 * ("2026/09/<uuid>-640.webp").
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { MediaVariant, NewMedia } from '@/db/schema';

export const VARIANT_WIDTHS = [320, 640, 960, 1280] as const;
export const IMAGE_WIDTH = 1600;
export const IMAGE_HEIGHT = 1000;

export type ImageSpec = {
  /** Stable key used by the article data to reference the image. */
  key: string;
  label: string;
  alt: string;
  caption: string;
  from: string;
  to: string;
};

export type GeneratedImage = {
  id: string;
  spec: ImageSpec;
  row: NewMedia;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgFor(spec: ImageSpec): string {
  const label = escapeXml(spec.label);
  const sub = escapeXml(spec.caption);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${spec.from}"/>
      <stop offset="100%" stop-color="${spec.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.8" cy="0.2" r="0.7">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <circle cx="1320" cy="760" r="260" fill="#ffffff" fill-opacity="0.08"/>
  <circle cx="240" cy="180" r="140" fill="#000000" fill-opacity="0.08"/>
  <rect x="96" y="640" width="1408" height="4" fill="#ffffff" fill-opacity="0.6"/>
  <text x="96" y="580" font-family="Helvetica, Arial, sans-serif" font-size="88" font-weight="700" fill="#ffffff">${label}</text>
  <text x="96" y="720" font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#ffffff" fill-opacity="0.9">${sub}</text>
  <text x="96" y="920" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#ffffff" fill-opacity="0.7">Illustrasjonsbilde · Elvebyen Tidende</text>
</svg>`;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Render one placeholder image and its variants to disk under `uploadDir`.
 * Returns the media row (without siteId/uploadedBy — the caller fills those).
 */
export async function generateImage(
  spec: ImageSpec,
  uploadDir: string,
  opts: { prefix: string },
): Promise<GeneratedImage> {
  const sharp = (await import('sharp')).default;
  const id = randomUUID();
  const svg = Buffer.from(svgFor(spec));

  const original = await sharp(svg, { density: 96 }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  const originalKey = `${opts.prefix}/${id}.jpg`;
  await writeFile(uploadDir, originalKey, original);

  const stats = await sharp(original).stats();
  const dominantColor = `#${toHex(stats.dominant.r)}${toHex(stats.dominant.g)}${toHex(stats.dominant.b)}`;

  const variants: Record<string, MediaVariant> = {};
  for (const width of VARIANT_WIDTHS) {
    const buf = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const meta = await sharp(buf).metadata();
    const key = `${opts.prefix}/${id}-${width}.webp`;
    await writeFile(uploadDir, key, buf);
    variants[String(width)] = {
      key,
      width: meta.width ?? width,
      height: meta.height ?? Math.round((width * IMAGE_HEIGHT) / IMAGE_WIDTH),
      format: 'webp',
      size: buf.length,
    };
  }

  const row: NewMedia = {
    id,
    siteId: '',
    kind: 'image',
    filename: `${spec.key}.jpg`,
    storageKey: originalKey,
    mime: 'image/jpeg',
    size: original.length,
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    alt: spec.alt,
    caption: spec.caption,
    credit: 'Foto: Elvebyen Tidende',
    license: 'Illustrasjon (generert)',
    focalX: 0.5,
    focalY: 0.5,
    variants,
    dominantColor,
    folder: 'Elvebyen',
    tags: ['seed', 'illustrasjon'],
  };
  return { id, spec, row };
}

async function writeFile(uploadDir: string, key: string, data: Buffer): Promise<void> {
  const file = path.join(uploadDir, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

/** Delete an original and all its variants from disk (ignores missing files). */
export async function deleteImageFiles(
  uploadDir: string,
  storageKey: string,
  variants: Record<string, MediaVariant> | null | undefined,
): Promise<void> {
  const keys = [storageKey, ...Object.values(variants ?? {}).map((v) => v.key)];
  await Promise.all(keys.map((k) => fs.rm(path.join(uploadDir, k), { force: true }).catch(() => {})));
}

/** The 12 seed images, each with its own colour pair. */
export const IMAGE_SPECS: ImageSpec[] = [
  {
    key: 'raadhus',
    label: 'Elvebyen rådhus',
    alt: 'Elvebyen rådhus sett fra torget en klar høstdag',
    caption: 'Rådhuset i Elvebyen, der kommunestyret møtes.',
    from: '#0b3d91',
    to: '#4f7ad9',
  },
  {
    key: 'skole',
    label: 'Bekkelund skole',
    alt: 'Skolegården ved Bekkelund skole med elever i lek',
    caption: 'Bekkelund skole har hatt vekst i elevtallet tre år på rad.',
    from: '#c2410c',
    to: '#fb923c',
  },
  {
    key: 'fotball',
    label: 'Elvebyen IL',
    alt: 'Fotballbanen på Elvebyen stadion under en kamp',
    caption: 'Elvebyen stadion, hjemmebane for Elvebyen IL.',
    from: '#166534',
    to: '#4ade80',
  },
  {
    key: 'kulturhus',
    label: 'Elvebyen kulturhus',
    alt: 'Fasaden på Elvebyen kulturhus opplyst om kvelden',
    caption: 'Kulturhuset fylles til randen under Elvefestivalen.',
    from: '#7e22ce',
    to: '#c084fc',
  },
  {
    key: 'bro',
    label: 'Gamlebrua',
    alt: 'Gamlebrua over Elva med lys fra gatelyktene',
    caption: 'Gamlebrua skal rehabiliteres for 42 millioner kroner.',
    from: '#0f172a',
    to: '#64748b',
  },
  {
    key: 'havn',
    label: 'Elvebyen havn',
    alt: 'Fiskebåter fortøyd i Elvebyen havn i morgenlys',
    caption: 'Havna i Elvebyen er fortsatt arbeidsplass for åtte fiskebåter.',
    from: '#0e7490',
    to: '#67e8f9',
  },
  {
    key: 'marked',
    label: 'Torgdagen',
    alt: 'Boder med grønnsaker og håndverk på torget i Elvebyen',
    caption: 'Torgdagen samler lokale produsenter første lørdag i måneden.',
    from: '#b91c1c',
    to: '#f87171',
  },
  {
    key: 'skog',
    label: 'Storåsen',
    alt: 'Turstien opp mot Storåsen mellom høstfargede trær',
    caption: 'Storåsen er kommunens mest brukte turområde.',
    from: '#365314',
    to: '#a3e635',
  },
  {
    key: 'buss',
    label: 'Elvebyen busstasjon',
    alt: 'En elektrisk buss ved holdeplassen på Elvebyen busstasjon',
    caption: 'Fra nyttår kjører alle bybussene i Elvebyen på strøm.',
    from: '#1e3a8a',
    to: '#38bdf8',
  },
  {
    key: 'bibliotek',
    label: 'Elvebyen bibliotek',
    alt: 'Lesesalen i Elvebyen bibliotek med høye bokhyller',
    caption: 'Biblioteket har utvidet åpningstidene til klokka 21.',
    from: '#78350f',
    to: '#fbbf24',
  },
  {
    key: 'fabrikk',
    label: 'Elvebyen Trevare',
    alt: 'Produksjonshallen hos Elvebyen Trevare med stabler av planker',
    caption: 'Elvebyen Trevare er byens største private arbeidsgiver.',
    from: '#3f3f46',
    to: '#a1a1aa',
  },
  {
    key: 'elv',
    label: 'Elva ved Kvernfossen',
    alt: 'Kvernfossen i Elva med høy vannføring etter regnvær',
    caption: 'Kvernfossen etter en uke med regn.',
    from: '#134e4a',
    to: '#2dd4bf',
  },
];
