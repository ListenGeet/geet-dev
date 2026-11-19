import type { NextConfig } from 'next';
import { apiEnv, apiSecurityHeaders, assertEnv } from '@geet/shared';

// Fails the build when REQUIRE_ENV=1 and a required variable is missing (docs/12).
assertEnv('api', apiEnv, process.env);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@geet/shared'],
  async headers() {
    return [{ source: '/:path*', headers: apiSecurityHeaders() }];
  },
};

export default config;
