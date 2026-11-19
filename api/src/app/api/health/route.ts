import { corsFor, preflight } from '@/lib/cors';
import { appVersion } from '@/lib/version';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return Response.json(
    { ok: true, version: appVersion() },
    { headers: { 'Cache-Control': 'no-store', ...corsFor(request) } },
  );
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
