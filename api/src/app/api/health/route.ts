import { corsFor, preflight } from '@/lib/cors';
import { pingDb } from '@/lib/repo';
import { appVersion } from '@/lib/version';

export const dynamic = 'force-dynamic';

/** `{ ok, version, db }`. Answers 503 with db "down" when the database cannot be reached (docs/15). */
export async function GET(request: Request) {
  const up = await pingDb().catch(() => false);
  const db = up ? 'up' : 'down';
  return Response.json(
    { ok: db === 'up', version: appVersion(), db },
    {
      status: db === 'up' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', ...corsFor(request) },
    },
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
