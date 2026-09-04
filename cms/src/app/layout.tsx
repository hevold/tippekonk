/**
 * Root layout: fonts, global styles and the <html lang> attribute.
 * No chrome here — the public site and the admin add their own.
 */
import type { Metadata, Viewport } from 'next';

import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Desken', template: '%s – Desken' },
  description: 'Publiseringssystem for norske redaksjoner.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f4' },
    { media: '(prefers-color-scheme: dark)', color: '#141413' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="nb" className="h-full antialiased">
      <body className="bg-bg text-text flex min-h-full flex-col">{children}</body>
    </html>
  );
}
