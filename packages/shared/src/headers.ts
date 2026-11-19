export interface HeaderPair {
  key: string;
  value: string;
}

interface WebOptions {
  /** Next.js dev server needs eval for hot reload. Never true in a production build. */
  dev?: boolean;
  /** Extra https origins, such as the API origin. */
  extraConnect?: string[];
}

/**
 * Content-Security-Policy for the web app (docs/18): self, Clerk, Supabase (https and wss),
 * storage hosts (B2, Supabase Storage, optional cdn.), no Google fonts (self-hosted).
 * Inline scripts are allowed because Next.js emits inline bootstrap scripts; a nonce would force
 * every page to render per request. Tighten in Phase 7.
 */
export function webCsp({ dev = false, extraConnect = [] }: WebOptions = {}): string {
  const clerk = ['https://*.clerk.accounts.dev', 'https://clerk.listengeet.com'];
  const supabase = ['https://*.supabase.co', 'wss://*.supabase.co'];
  const storage = ['https://*.backblazeb2.com', 'https://cdn.listengeet.com'];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(dev ? ["'unsafe-eval'"] : []),
      ...clerk,
      'https://challenges.cloudflare.com',
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://img.clerk.com',
      ...storage,
      ...supabase.slice(0, 1),
    ],
    'font-src': ["'self'"],
    'media-src': ["'self'", 'blob:', ...storage, ...supabase.slice(0, 1)],
    'connect-src': ["'self'", ...clerk, ...supabase, ...storage, ...extraConnect],
    'frame-src': ['https://challenges.cloudflare.com', ...clerk],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

/** The API serves JSON only, so nothing may load or embed from it. */
export const apiCsp = "default-src 'none'; frame-ancestors 'none'";

const common: HeaderPair[] = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

export function webSecurityHeaders(options: WebOptions = {}): HeaderPair[] {
  return [{ key: 'Content-Security-Policy', value: webCsp(options) }, ...common];
}

export function apiSecurityHeaders(): HeaderPair[] {
  return [{ key: 'Content-Security-Policy', value: apiCsp }, ...common];
}
