import { withUser } from '@/lib/route';
import { fail, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { incomingKey } from '@geet/shared';
import { preflight } from '@/lib/cors';

type Params = { params: Promise<{ trackId: string }> };
export const dynamic = 'force-dynamic';

export const GET = withUser(async (request, { profile }, { params }: Params) => {
  const { trackId } = await params;
  const { data, error } = await db()
    .from('tracks')
    .select('id,uploader_id,title,artist,album,status,error,created_at')
    .eq('id', trackId)
    .maybeSingle();
  if (error) throw new Error(`upload status: ${error.message}`);
  if (!data || (data.uploader_id !== profile.id && profile.role !== 'admin'))
    return fail(request, 'not_found', 'That upload was not found.');
  return ok(request, data);
});

export const DELETE = withUser(async (request, { profile }, { params }: Params) => {
  const { trackId } = await params;
  const { data: track, error } = await db()
    .from('tracks')
    .select('id,uploader_id,status')
    .eq('id', trackId)
    .maybeSingle();
  if (error) throw new Error(`upload lookup: ${error.message}`);
  if (!track || (track.uploader_id !== profile.id && profile.role !== 'admin'))
    return fail(request, 'not_found', 'That upload was not found.');
  const { data: files, error: fileError } = await db()
    .from('track_files')
    .select('path')
    .eq('track_id', trackId);
  if (fileError) throw new Error(`upload files: ${fileError.message}`);
  await storage().remove([
    incomingKey(track.uploader_id, trackId),
    ...(files ?? []).map((file) => file.path),
  ]);
  const { error: removeError } = await db().from('tracks').delete().eq('id', trackId);
  if (removeError) throw new Error(`upload delete: ${removeError.message}`);
  return ok(request, { deleted: true });
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
