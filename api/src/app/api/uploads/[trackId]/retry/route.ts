import { withUser } from '@/lib/route';
import { fail, ok } from '@/lib/http';
import { db } from '@/lib/db';
import { dispatchTranscode } from '@/lib/uploads';

type Params = { params: Promise<{ trackId: string }> };
export const dynamic = 'force-dynamic';
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
  if (track.status !== 'failed')
    return fail(request, 'invalid', 'Only failed uploads can be retried.');
  const { error: jobError } = await db()
    .from('upload_jobs')
    .update({ state: 'queued', attempts: 0, error: null, lease_until: null })
    .eq('track_id', trackId);
  if (jobError) throw new Error(`upload retry: ${jobError.message}`);
  const { error: trackError } = await db()
    .from('tracks')
    .update({ status: 'queued', error: null })
    .eq('id', trackId);
  if (trackError) throw new Error(`track retry: ${trackError.message}`);
  const dispatched = await dispatchTranscode();
  return ok(request, { queued: true, dispatched }, 202);
});
