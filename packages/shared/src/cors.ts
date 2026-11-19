/** Parses CORS_ORIGINS into a clean list. */
export function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export const CORS_METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
export const CORS_HEADERS = 'Authorization, Content-Type';
export const CORS_MAX_AGE_SECONDS = 86400;

/**
 * Returns the headers to send for a request origin, or null when the origin is not allowed.
 * No cookies are used, so credentials mode stays off.
 */
export function corsHeaders(
  origin: string | null,
  allowed: string[],
): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age': String(CORS_MAX_AGE_SECONDS),
    Vary: 'Origin',
  };
}
