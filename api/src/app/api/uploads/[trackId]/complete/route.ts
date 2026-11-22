import { withUser } from '@/lib/route';
import { fail, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { incomingKey } from '@geet/shared';
import { dispatchTranscode } from '@/lib/uploads';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ trackId: string }> };

export const POST = withUser(async (request, { profile }, { params }: Params) => {
  const { trackId } = await params;
  const { data: track, error } = await db()
    .from('tracks')
    .select('id,uploader_id,status')
    .eq('id', trackId)
    .maybeSingle();
  if (error) throw new Error(`upload lookup: ${error.message}`);
  if (!track || (track.uploader_id !== profile.id && profile.role !== 'admin'))
    return fail(request, 'not_found', 'That upload was not found.');
  if (track.status !== 'uploading')
    return ok(request, { queued: track.status === 'queued', status: track.status }, 202);
  const object = await storage().exists(incomingKey(track.uploader_id, trackId));
  if (!object || object.size < 1)
    return fail(request, 'invalid', 'The uploaded file is not in storage yet.');
  const { data: job, error: jobLookupError } = await db()
    .from('upload_jobs')
    .select('expected_size')
    .eq('track_id', trackId)
    .eq('state', 'awaiting_upload')
    .maybeSingle();
  if (jobLookupError) throw new Error(`upload job lookup: ${jobLookupError.message}`);
  if (job?.expected_size && Number(job.expected_size) !== object.size)
    return fail(
      request,
      'invalid',
      'The uploaded file size does not match. Please upload it again.',
    );
  const { error: jobError } = await db()
    .from('upload_jobs')
    .update({ state: 'queued', error: null })
    .eq('track_id', trackId)
    .eq('state', 'awaiting_upload');
  if (jobError) throw new Error(`upload queue: ${jobError.message}`);
  const { error: trackError } = await db()
    .from('tracks')
    .update({ status: 'queued' })
    .eq('id', trackId);
  if (trackError) throw new Error(`track queue: ${trackError.message}`);
  const dispatched = await dispatchTranscode();
  return ok(request, { queued: true, dispatched }, 202);
});

export function OPTIONS(request: Request) {
  return preflight(request);
}
