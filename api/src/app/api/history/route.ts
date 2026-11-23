import { withUser, limited } from '@/lib/route';
import { readJson, fail, ok, clientIp } from '@/lib/http';
import { db } from '@/lib/db';
import { preflight } from '@/lib/cors';
import { toTrackDto, type TrackRow } from '@/lib/catalogue';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST = withUser(async (request, { profile }) => {
  const blocked = await limited(request, `ip:${clientIp(request)}:history`, 60, 60);
  if (blocked) return blocked;
  const parsed = await readJson(request);
  if ('response' in parsed) return parsed.response;
  const body = parsed.body as { trackId?: unknown; listenedMs?: unknown; outcome?: unknown };
  if (
    typeof body.trackId !== 'string' ||
    !uuid.test(body.trackId) ||
    !Number.isSafeInteger(body.listenedMs) ||
    Number(body.listenedMs) < 0 ||
    !['completed', 'skipped', 'partial'].includes(String(body.outcome))
  )
    return fail(request, 'invalid', 'Send a song, listening time, and outcome.');
  const { error } = await db()
    .from('play_history')
    .insert({
      profile_id: profile.id,
      track_id: body.trackId,
      listened_ms: Math.min(Number(body.listenedMs), 86_400_000),
      outcome: body.outcome,
    });
  if (error) throw new Error(`play history: ${error.message}`);
  return ok(request, { saved: true }, 201);
});

export const GET = withUser(async (request, { profile }) => {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
  const { data, error } = await db()
    .from('play_history')
    .select('id,track_id,played_at,listened_ms,outcome,tracks(*)')
    .eq('profile_id', profile.id)
    .or('outcome.eq.completed,listened_ms.gte.30000')
    .order('played_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`play history: ${error.message}`);
  let previousTrackId: string | null = null;
  const items = (
    (data ?? []) as unknown as { id: string; track_id: string; tracks: TrackRow | null }[]
  )
    .filter((item) => {
      if (!item.tracks || item.track_id === previousTrackId) return false;
      previousTrackId = item.track_id;
      return true;
    })
    .map((item) => ({ ...item, tracks: item.tracks ? toTrackDto(item.tracks) : null }));
  return ok(request, { items });
});

export const DELETE = withUser(async (request, { profile }) => {
  const { error } = await db().from('play_history').delete().eq('profile_id', profile.id);
  if (error) throw new Error(`play history clear: ${error.message}`);
  return ok(request, { deleted: true });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
