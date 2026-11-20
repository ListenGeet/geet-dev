import { corsFor } from './cors';

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'gone'
  | 'rate_limited'
  | 'invalid'
  | 'capped'
  | 'server_error';

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  gone: 410,
  rate_limited: 429,
  invalid: 422,
  capped: 503,
  server_error: 500,
};

const BASE = { 'Cache-Control': 'no-store' };

/** `{ error: { code, message } }` with the right status (docs/15). Messages are plain words, never internals. */
export function fail(
  request: Request,
  code: ErrorCode,
  message: string,
  extra: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status: STATUS[code], headers: { ...BASE, ...corsFor(request), ...extra } },
  );
}

export function ok(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { ...BASE, ...corsFor(request) } });
}

export const MAX_BODY_BYTES = 64 * 1024;

/** Reads a JSON body of at most 64 KB. Returns null with a ready error response when it is not usable. */
export async function readJson(
  request: Request,
): Promise<{ body: unknown } | { response: Response }> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES)
    return { response: fail(request, 'invalid', 'That request is too large.') };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { response: fail(request, 'invalid', 'That request is too large.') };
  }
  try {
    return { body: text === '' ? {} : JSON.parse(text) };
  } catch {
    return { response: fail(request, 'invalid', 'Send valid JSON.') };
  }
}

/** First hop of x-forwarded-for, as set by Vercel. Used only to key rate limits, never stored on its own. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}
