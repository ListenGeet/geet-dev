import { db } from '@/lib/db';
import { ok } from '@/lib/http';
import { withUser } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (request, { profile }) => {
  const ids = new URL(request.url).searchParams.getAll('id').slice(0, 100);
  if (!ids.length) return ok(request, { removed: [] });
  const { data, error } = await db()
    .from('tracks')
    .select('id')
    .in('id', ids)
    .eq('status', 'ready');
  if (error) throw new Error(`downloads check: ${error.message}`);
  const ready = new Set((data ?? []).map((row) => row.id));
  // The authenticated owner's profile is loaded by withUser; no cross-user state is returned.
  void profile;
  return ok(request, { removed: ids.filter((id) => !ready.has(id)) });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
