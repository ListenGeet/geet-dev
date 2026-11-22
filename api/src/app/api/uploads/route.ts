import { withUser, limited } from '@/lib/route';
import { fail, ok, readJson } from '@/lib/http';
import { bumpUsage } from '@/lib/repo';
import { createUpload, mayUpload } from '@/lib/uploads';
import { preflight } from '@/lib/cors';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = withUser(async (request, { profile }) => {
  const throttle = await limited(request, `upload:${profile.id}`, 10, 60);
  if (throttle) return throttle;
  if (!mayUpload(profile)) return fail(request, 'forbidden', 'Uploads are limited right now.');
  const read = await readJson(request);
  if ('response' in read) return read.response;
  const body = read.body as Record<string, unknown>;
  if (
    typeof body.fileName !== 'string' ||
    body.fileName.length > 255 ||
    typeof body.size !== 'number' ||
    typeof body.contentType !== 'string' ||
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    body.title.length > 120 ||
    typeof body.artist !== 'string' ||
    !body.artist.trim() ||
    body.artist.length > 120 ||
    (body.album !== undefined && (typeof body.album !== 'string' || body.album.length > 120))
  )
    return fail(request, 'invalid', 'Check the song details and file.');
  try {
    const { track, grant } = await createUpload(profile, {
      size: body.size,
      contentType: body.contentType,
      title: body.title.trim(),
      artist: body.artist.trim(),
      album: body.album as string | undefined,
    });
    await bumpUsage(profile.id, 'uploads');
    return ok(
      request,
      { trackId: track.id, uploadUrl: grant.url, method: grant.method, headers: grant.headers },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'size') return fail(request, 'invalid', 'That file must be under 50 MB.');
    if (message === 'type') return fail(request, 'invalid', 'Choose an audio file.');
    if (message === 'daily')
      return fail(request, 'rate_limited', 'You have reached today’s upload limit.');
    throw error;
  }
});

export const GET = withUser(async (request, { profile }) => {
  const { data, error } = await db()
    .from('tracks')
    .select('id,title,artist,album,status,error,created_at')
    .eq('uploader_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`uploads list: ${error.message}`);
  return ok(request, { items: data ?? [] });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
