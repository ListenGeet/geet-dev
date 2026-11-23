import type { NextConfig } from 'next';
import { assertEnv, webEnv, webSecurityHeaders } from '@geet/shared';

// Fails the build when REQUIRE_ENV=1 and a required variable is missing (docs/12).
assertEnv('web', webEnv, process.env);

const isDev = process.env.NODE_ENV !== 'production';
const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');

const config: NextConfig = {
  distDir: process.env.GEET_AUDIT_DIST_DIR ?? '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@geet/shared'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: webSecurityHeaders({ dev: isDev, extraConnect: apiUrl ? [apiUrl] : [] }),
      },
      // The service worker must never be served from a stale cache.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  // docs/19 contract 2: the service worker watches same-origin /api/cover and /api/lyrics.
  async rewrites() {
    if (!apiUrl) return [];
    return [
      { source: '/api/cover/:id', destination: `${apiUrl}/api/cover/:id` },
      { source: '/api/lyrics/:id', destination: `${apiUrl}/api/lyrics/:id` },
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
    ];
  },
};

export default config;
