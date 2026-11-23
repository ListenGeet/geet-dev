import { db } from '@/lib/db';
import { fail, ok, readJson } from '@/lib/http';
import { withUser } from '@/lib/route';
import { preflight } from '@/lib/cors';
import { toTrackDto, type TrackRow } from '@/lib/catalogue';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = withUser(async (request, { profile }) => {
  const { data, error } = await db()
    .from('favorites')
    .select('track_id,created_at,tracks(*)')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`favorites: ${error.message}`);
  const items = (
    (data ?? []) as unknown as { track_id: string; created_at: string; tracks: TrackRow | null }[]
  ).map((item) => ({ ...item, tracks: item.tracks ? toTrackDto(item.tracks) : null }));
  return ok(request, { items });
});

export const POST = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const trackId = (parsed.body as { trackId?: unknown })?.trackId;
  if (typeof trackId !== 'string' || !uuid.test(trackId))
    return fail(request, 'invalid', 'Choose a valid song.');
  const { error } = await db()
    .from('favorites')
    .upsert(
      { profile_id: profile.id, track_id: trackId },
      { onConflict: 'profile_id,track_id', ignoreDuplicates: true },
    );
  if (error) throw new Error(`favorite add: ${error.message}`);
  return ok(request, { saved: true }, 201);
});

export const DELETE = withUser(async (request, { profile }) => {
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const trackId = (parsed.body as { trackId?: unknown })?.trackId;
  if (typeof trackId !== 'string' || !uuid.test(trackId))
    return fail(request, 'invalid', 'Choose a valid song.');
  const { error } = await db()
    .from('favorites')
    .delete()
    .eq('profile_id', profile.id)
    .eq('track_id', trackId);
  if (error) throw new Error(`favorite remove: ${error.message}`);
  return ok(request, { saved: false });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
