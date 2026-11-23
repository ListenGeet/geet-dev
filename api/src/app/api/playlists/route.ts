import { db } from '@/lib/db';
import { fail, ok, readJson } from '@/lib/http';
import { withUser } from '@/lib/route';
import { preflight } from '@/lib/cors';
import { toTrackDto, type TrackRow } from '@/lib/catalogue';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = withUser(async (request, { profile }) => {
  const { data, error } = await db()
    .from('playlists')
    .select(
      'id,name,kind,mix_index,updated_at,created_at,playlist_tracks(track_id,position,tracks(*))',
    )
    .eq('owner_id', profile.id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`playlists: ${error.message}`);
  const items = (
    (data ?? []) as unknown as { id: string; playlist_tracks: { tracks: TrackRow | null }[] }[]
  ).map((item) => ({
    ...item,
    playlist_tracks: (item.playlist_tracks ?? []).map((row) => ({
      ...row,
      tracks: row.tracks ? toTrackDto(row.tracks) : null,
    })),
  }));
  return ok(request, { items });
});

export const POST = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const name = (parsed.body as { name?: unknown })?.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100)
    return fail(request, 'invalid', 'Name your playlist (up to 100 characters).');
  const { count, error: countError } = await db()
    .from('playlists')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', profile.id)
    .eq('kind', 'user');
  if (countError) throw new Error(`playlist count: ${countError.message}`);
  if ((count ?? 0) >= 200) return fail(request, 'capped', 'You have reached the playlist limit.');
  const { data, error } = await db()
    .from('playlists')
    .insert({ owner_id: profile.id, name: name.trim(), kind: 'user' })
    .select('id,name,kind,created_at,updated_at')
    .single();
  if (error) throw new Error(`playlist create: ${error.message}`);
  return ok(request, data, 201);
});

export const PATCH = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body as { id?: unknown; name?: unknown; trackIds?: unknown };
  if (typeof body.id !== 'string' || !uuid.test(body.id))
    return fail(request, 'invalid', 'Choose a valid playlist.');
  const { data: playlist, error: lookupError } = await db()
    .from('playlists')
    .select('id,kind')
    .eq('id', body.id)
    .eq('owner_id', profile.id)
    .single();
  if (lookupError || !playlist || playlist.kind !== 'user')
    return fail(request, 'not_found', 'Playlist not found.');
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)
      return fail(request, 'invalid', 'Name your playlist (up to 100 characters).');
    const { error } = await db()
      .from('playlists')
      .update({ name: body.name.trim(), updated_at: new Date().toISOString() })
      .eq('id', playlist.id)
      .eq('owner_id', profile.id);
    if (error) throw new Error(`playlist rename: ${error.message}`);
  }
  if (body.trackIds !== undefined) {
    if (
      !Array.isArray(body.trackIds) ||
      body.trackIds.length > 500 ||
      body.trackIds.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
      new Set(body.trackIds).size !== body.trackIds.length
    )
      return fail(request, 'invalid', 'Send the ordered songs in this playlist.');
    const { error } = await db().rpc('replace_playlist_tracks', {
      p_playlist: playlist.id,
      p_owner: profile.id,
      p_tracks: body.trackIds,
    });
    if (error) throw new Error(`playlist reorder: ${error.message}`);
  }
  return ok(request, { saved: true });
});

export const DELETE = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const id = (parsed.body as { id?: unknown })?.id;
  if (typeof id !== 'string' || !uuid.test(id))
    return fail(request, 'invalid', 'Choose a valid playlist.');
  const { error, count } = await db()
    .from('playlists')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('owner_id', profile.id)
    .eq('kind', 'user');
  if (error) throw new Error(`playlist delete: ${error.message}`);
  if (!count) return fail(request, 'not_found', 'Playlist not found.');
  return ok(request, { deleted: true });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
