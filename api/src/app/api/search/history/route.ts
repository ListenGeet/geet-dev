import { withUser } from '@/lib/route';
import { fail, ok, readJson } from '@/lib/http';
import { db } from '@/lib/db';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (request, { profile }) => {
  const { data, error } = await db()
    .from('search_history')
    .select('id,query,created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`search history: ${error.message}`);
  return ok(request, { items: data ?? [] });
});

export const POST = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const query = (parsed.body as { query?: unknown } | null)?.query;
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 120)
    return fail(request, 'invalid', 'Search up to 120 characters.');
  const cleaned = query.trim();
  const { error } = await db()
    .from('search_history')
    .insert({ profile_id: profile.id, query: cleaned });
  if (error && error.code !== '23505') throw new Error(`search history save: ${error.message}`);
  return ok(request, { saved: true }, 201);
});

export const DELETE = withUser(async (request, { profile }) => {
  let query = db().from('search_history').delete().eq('profile_id', profile.id);
  const search = new URL(request.url).searchParams.get('q');
  if (search) query = query.eq('query', search);
  const { error } = await query;
  if (error) throw new Error(`search history clear: ${error.message}`);
  return ok(request, { deleted: true });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
