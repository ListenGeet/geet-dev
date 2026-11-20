import { verifyToken } from '@clerk/backend';
import { allowedOrigins } from './cors';

export interface Caller {
  /** Clerk user id, `user_…`. */
  sub: string;
}

/**
 * Verifies the Clerk session token in `Authorization: Bearer …` (docs/12, docs/15).
 * Returns null for anything that is not a valid, unexpired token from an allowed origin.
 */
export async function authenticate(request: Request): Promise<Caller | null> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');
  try {
    const claims = await verifyToken(match[1] ?? '', {
      secretKey,
      authorizedParties: allowedOrigins(),
    });
    return typeof claims.sub === 'string' && claims.sub !== '' ? { sub: claims.sub } : null;
  } catch {
    return null;
  }
}

/** Constant-time compare for shared secrets (cron, worker). */
export function secretMatches(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const given = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
