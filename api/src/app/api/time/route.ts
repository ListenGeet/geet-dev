import { ok, preflight } from '@/lib/http';

export function OPTIONS(request: Request) {
  return preflight(request);
}

export function GET(request: Request) {
  return ok(request, { now: Date.now() });
}
