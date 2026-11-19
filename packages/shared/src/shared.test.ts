import { describe, expect, it } from 'vitest';
import { apiEnv, assertEnv, corsHeaders, parseOrigins, validateEnv } from './index';

describe('validateEnv', () => {
  it('reports missing variables by name only', () => {
    expect(validateEnv(apiEnv, {})).toEqual([
      'NEXT_PUBLIC_APP_URL is missing',
      'CORS_ORIGINS is missing',
    ]);
  });
  it('accepts valid values', () => {
    const env = {
      NEXT_PUBLIC_APP_URL: 'https://a.example.com',
      CORS_ORIGINS: 'https://a.example.com, http://localhost:3000',
    };
    expect(validateEnv(apiEnv, env)).toEqual([]);
  });
  it('does not echo a bad value', () => {
    const problems = validateEnv(apiEnv, {
      NEXT_PUBLIC_APP_URL: 'nope',
      CORS_ORIGINS: 'https://a.example.com',
    });
    expect(problems).toEqual(['NEXT_PUBLIC_APP_URL must be a URL']);
  });
});

describe('assertEnv', () => {
  it('throws when REQUIRE_ENV=1', () => {
    expect(() => assertEnv('api', apiEnv, { REQUIRE_ENV: '1' })).toThrow(/CORS_ORIGINS is missing/);
  });
  it('returns false without throwing otherwise', () => {
    expect(assertEnv('api', apiEnv, {})).toBe(false);
  });
});

describe('cors', () => {
  const allowed = parseOrigins('https://listengeet.com, https://dev.listengeet.com/');
  it('trims and strips trailing slashes', () => {
    expect(allowed).toEqual(['https://listengeet.com', 'https://dev.listengeet.com']);
  });
  it('allows a listed origin', () => {
    expect(
      corsHeaders('https://dev.listengeet.com', allowed)?.['Access-Control-Allow-Origin'],
    ).toBe('https://dev.listengeet.com');
  });
  it('blocks an unlisted or missing origin', () => {
    expect(corsHeaders('https://evil.example.com', allowed)).toBeNull();
    expect(corsHeaders(null, allowed)).toBeNull();
  });
});

import { apiSecurityHeaders, webCsp, webSecurityHeaders } from './index';

describe('security headers', () => {
  const names = (h: { key: string }[]) => h.map((x) => x.key);
  const required = [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ];
  it('web sets every header from docs/18', () => {
    expect(names(webSecurityHeaders())).toEqual(required);
  });
  it('api sets every header from docs/18', () => {
    expect(names(apiSecurityHeaders())).toEqual(required);
  });
  it('web CSP forbids framing, Google fonts and eval in production', () => {
    const csp = webCsp();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain('wss://*.supabase.co');
  });
  it('web CSP allows eval only in dev', () => {
    expect(webCsp({ dev: true })).toContain("'unsafe-eval'");
  });
  it('permissions policy disables camera, microphone, geolocation', () => {
    const p = apiSecurityHeaders().find((h) => h.key === 'Permissions-Policy')?.value;
    expect(p).toBe('camera=(), microphone=(), geolocation=()');
  });
});
