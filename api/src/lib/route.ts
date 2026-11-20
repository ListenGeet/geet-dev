import { authenticate } from './auth';
import { fail, type ErrorCode } from './http';
import { loadOrCreateProfile } from './me';
import { rateLimitHit, type ProfileRow } from './repo';
import { clientIp } from './http';

export interface UserContext {
  sub: string;
  profile: ProfileRow;
}

interface Options {
  /** Calls per window, default 120 per minute per user (docs/15: every user endpoint is rate limited). */
  limit?: number;
  windowSeconds?: number;
  admin?: boolean;
}

/** Returns a 429 response when the key is over its limit, otherwise null. */
export async function limited(
  request: Request,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const allowed = await rateLimitHit(key, limit, windowSeconds);
  return allowed
    ? null
    : fail(request, 'rate_limited', 'Too many requests. Try again in a minute.', {
        'Retry-After': String(windowSeconds),
      });
}

/** Authenticate, rate limit, load the profile, then run the handler. Authorisation always comes first. */
export function withUser<A extends unknown[]>(
  handler: (request: Request, ctx: UserContext, ...args: A) => Promise<Response>,
  options: Options = {},
) {
  return async (request: Request, ...args: A): Promise<Response> => {
    try {
      const caller = await authenticate(request);
      if (!caller) return fail(request, 'unauthorized', 'Sign in to continue.');
      const tooMany = await limited(
        request,
        `user:${caller.sub}`,
        options.limit ?? 120,
        options.windowSeconds ?? 60,
      );
      if (tooMany) return tooMany;
      const profile = await loadOrCreateProfile(caller.sub);
      if (options.admin && profile.role !== 'admin')
        return fail(request, 'forbidden', 'This is for admins.');
      return await handler(request, { sub: caller.sub, profile }, ...args);
    } catch (err) {
      return serverError(request, err);
    }
  };
}

/** Logs the message (never the request body or a token) and answers with plain words. */
export function serverError(
  request: Request,
  err: unknown,
  code: ErrorCode = 'server_error',
): Response {
  console.error('[api] error:', err instanceof Error ? err.message : 'unknown');
  return fail(request, code, 'Something went wrong on our side. Try again in a moment.');
}

export { clientIp };
