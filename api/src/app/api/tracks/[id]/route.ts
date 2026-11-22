import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { incomingKey, trackFileKey, coverKey } from '@geet/shared';
import { preflight } from '@/lib/cors';
import { trackById, toTrackDto } from '@/lib/catalogue';
import { withUser } from '@/lib/route';
import { fail, ok } from '@/lib/http';
import { clientIp } from '@/lib/http';
import { limited } from '@/lib/route';

type Params = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:track`, 60, 60);
    if (blocked) return blocked;
    const { id } = await params;
    const track = await trackById(id);
    if (!track) return fail(request, 'not_found', 'That song was not found.');
    if (track.status === 'hidden' || track.status === 'removed')
      return fail(request, 'gone', "This song isn't on Geet anymore.");
    if (track.status !== 'ready') return fail(request, 'not_found', 'That song is not available.');
    return ok(request, { track: toTrackDto(track) });
  } catch (error) {
    console.error('[api] track lookup failed:', error instanceof Error ? error.message : 'unknown');
    return fail(request, 'server_error', 'That song could not be loaded right now.');
  }
}

export const DELETE = withUser(async (request, { profile }, { params }: Params) => {
  const { id } = await params;
  const { data: track, error } = await db()
    .from('tracks')
    .select('id,uploader_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`track lookup: ${error.message}`);
  if (!track || (track.uploader_id !== profile.id && profile.role !== 'admin'))
    return fail(request, 'not_found', 'That song was not found.');
  const { data: files, error: fileError } = await db()
    .from('track_files')
    .select('path')
    .eq('track_id', id);
  if (fileError) throw new Error(`track files: ${fileError.message}`);
  await storage().remove([
    incomingKey(track.uploader_id, id),
    coverKey(id),
    trackFileKey(id, 'full'),
    trackFileKey(id, 'preview'),
    ...(files ?? []).map((file) => file.path),
  ]);
  const { error: deleteError } = await db().from('tracks').delete().eq('id', id);
  if (deleteError) throw new Error(`track delete: ${deleteError.message}`);
  return ok(request, { deleted: true });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
