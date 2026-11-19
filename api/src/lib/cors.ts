import { corsHeaders, parseOrigins } from '@geet/shared';

/** Allowed origins come from CORS_ORIGINS only. Read per request so the value is never baked in. */
export function allowedOrigins(): string[] {
  return parseOrigins(process.env.CORS_ORIGINS);
}

/** Headers for an allowed origin; empty for anyone else, so the browser blocks the response. */
export function corsFor(request: Request): Record<string, string> {
  return corsHeaders(request.headers.get('origin'), allowedOrigins()) ?? {};
}

/** Preflight. 204 with CORS headers for an allowed origin, 403 for any other origin. */
export function preflight(request: Request): Response {
  const headers = corsFor(request);
  if (Object.keys(headers).length === 0) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers });
}
