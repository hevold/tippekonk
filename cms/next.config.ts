import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', '@node-rs/argon2', 'postgres', 'nodemailer'],
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/admin/:path*', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
    ];
  },
};

export default nextConfig;
