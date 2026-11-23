import { ok } from '@/lib/http';

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export function cronDenied(request: Request): Response | null {
  return cronAuthorized(request)
    ? null
    : Response.json(
        { error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
}

export { ok };
