import { db } from '@/lib/db';
import { fail, ok, readJson } from '@/lib/http';
import { withUser } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    if (!uuid.test(id)) return fail(request, 'not_found', 'Playlist not found.');
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const trackId = (parsed.body as { trackId?: unknown })?.trackId;
    if (typeof trackId !== 'string' || !uuid.test(trackId))
      return fail(request, 'invalid', 'Choose a valid song.');
    const { data: list, error: listError } = await db()
      .from('playlists')
      .select('id,kind')
      .eq('id', id)
      .eq('owner_id', profile.id)
      .single();
    if (listError || !list || list.kind !== 'user')
      return fail(request, 'not_found', 'Playlist not found.');
    const { count, error: countError } = await db()
      .from('playlist_tracks')
      .select('track_id', { count: 'exact', head: true })
      .eq('playlist_id', id);
    if (countError) throw new Error(`playlist track count: ${countError.message}`);
    if ((count ?? 0) >= 500) return fail(request, 'capped', 'This playlist has reached 500 songs.');
    const { error } = await db()
      .from('playlist_tracks')
      .upsert(
        { playlist_id: id, track_id: trackId, position: count ?? 0 },
        { onConflict: 'playlist_id,track_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(`playlist add: ${error.message}`);
    return ok(request, { saved: true }, 201);
  },
);

export const DELETE = withUser(
  async (request, { profile }, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;
    if (!uuid.test(id)) return fail(request, 'not_found', 'Playlist not found.');
    const parsed = await readJson(request);
    if ('response' in parsed) return parsed.response;
    const trackId = (parsed.body as { trackId?: unknown })?.trackId;
    if (typeof trackId !== 'string' || !uuid.test(trackId))
      return fail(request, 'invalid', 'Choose a valid song.');
    const { data: list, error: listError } = await db()
      .from('playlists')
      .select('id')
      .eq('id', id)
      .eq('owner_id', profile.id)
      .eq('kind', 'user')
      .single();
    if (listError || !list) return fail(request, 'not_found', 'Playlist not found.');
    const { error } = await db()
      .from('playlist_tracks')
      .delete()
      .eq('playlist_id', id)
      .eq('track_id', trackId);
    if (error) throw new Error(`playlist remove: ${error.message}`);
    return ok(request, { saved: false });
  },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
