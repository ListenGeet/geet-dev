import { withUser } from '@/lib/route';
import { fail, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { incomingKey, trackFileKey, coverKey } from '@geet/shared';
import { preflight } from '@/lib/cors';

type Params = { params: Promise<{ id: string }> };
export const dynamic = 'force-dynamic';

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
