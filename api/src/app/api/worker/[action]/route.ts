import { secretMatches } from '@/lib/auth';
import { db } from '@/lib/db';
import { fail, ok, readJson } from '@/lib/http';
import { incomingKey, trackFileKey, coverKey } from '@geet/shared';
import { storage } from '@/lib/storage';
import { preflight } from '@/lib/cors';

type Params = { params: Promise<{ action: string }> };
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: Params) {
  if (!secretMatches(request, process.env.WORKER_SECRET))
    return fail(request, 'unauthorized', 'Worker authorization failed.');
  const { action } = await params;
  const payload = await readJson(request);
  if ('response' in payload) return payload.response;
  const body = payload.body as Record<string, unknown>;
  if (action === 'claim') {
    const worker = crypto.randomUUID();
    const { data: jobs, error } = await db().rpc('claim_upload_job', {
      p_worker: worker,
      p_lease_seconds: 300,
    });
    if (error) throw new Error(`worker claim: ${error.message}`);
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    // A function returning a composite row can serialize "no row" as an
    // object whose fields are all null. Treat that as an empty queue too.
    if (!job || !job.id || !job.track_id) return new Response(null, { status: 204 });
    const { data: track, error: trackError } = await db()
      .from('tracks')
      .select('id,uploader_id,title,artist,album')
      .eq('id', job.track_id)
      .single();
    if (trackError) throw new Error(`worker track: ${trackError.message}`);
    const src = incomingKey(track.uploader_id, track.id);
    const grant = (key: string) =>
      storage().signUpload(key, key.endsWith('.jpg') ? 'image/jpeg' : 'audio/mp4', 1200);
    return ok(request, {
      job,
      track,
      sourceUrl: await storage().signDownload(src, 1200),
      uploads: {
        full: await grant(trackFileKey(track.id, 'full')),
        preview: await grant(trackFileKey(track.id, 'preview')),
        cover: await grant(coverKey(track.id)),
      },
    });
  }
  if (action === 'heartbeat') {
    if (typeof body.jobId !== 'string') return fail(request, 'invalid', 'A job id is required.');
    const { error } = await db()
      .from('upload_jobs')
      .update({
        lease_until: new Date(Date.now() + 300_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.jobId)
      .eq('state', 'running');
    if (error) throw new Error(`worker heartbeat: ${error.message}`);
    return ok(request, { extended: true });
  }
  if (action === 'complete') {
    if (
      typeof body.jobId !== 'string' ||
      !Number.isInteger(body.durationMs) ||
      (body.durationMs as number) <= 0 ||
      !Array.isArray(body.waveform) ||
      body.waveform.length !== 64
    )
      return fail(request, 'invalid', 'The completed track data is invalid.');
    const waveform = body.waveform.map((v) =>
      Number.isInteger(v) ? Math.max(0, Math.min(100, v as number)) : 0,
    );
    const { data: job, error: jobError } = await db()
      .from('upload_jobs')
      .select('id,track_id')
      .eq('id', body.jobId)
      .eq('state', 'running')
      .single();
    if (jobError) throw new Error(`worker job: ${jobError.message}`);
    const { data: track, error: trackError } = await db()
      .from('tracks')
      .select('id,uploader_id')
      .eq('id', job.track_id)
      .single();
    if (trackError) throw new Error(`worker track: ${trackError.message}`);
    const files = body.files as
      Record<string, { size?: number; codec?: string; bitrate?: number }> | undefined;
    const specs = [
      {
        kind: 'full',
        key: trackFileKey(track.id, 'full'),
        content_type: 'audio/mp4',
        codec: 'aac',
        bitrate_kbps: 128,
      },
      {
        kind: 'preview',
        key: trackFileKey(track.id, 'preview'),
        content_type: 'audio/mp4',
        codec: 'aac',
        bitrate_kbps: 128,
      },
      ...(files?.cover
        ? [
            {
              kind: 'cover',
              key: coverKey(track.id),
              content_type: 'image/jpeg',
              codec: 'jpeg',
              bitrate_kbps: null,
            },
          ]
        : []),
    ];
    const inserts = specs.map((spec) => ({
      track_id: track.id,
      kind: spec.kind,
      path: spec.key,
      size_bytes: files?.[spec.kind]?.size ?? null,
      codec: spec.codec,
      bitrate_kbps: spec.bitrate_kbps,
      content_type: spec.content_type,
    }));
    const { error: filesError } = await db()
      .from('track_files')
      .upsert(inserts, { onConflict: 'track_id,kind' });
    if (filesError) throw new Error(`worker files: ${filesError.message}`);
    const { error: doneError } = await db().rpc('complete_upload_job', {
      p_job: body.jobId,
      p_duration_ms: body.durationMs,
      p_waveform: waveform,
      p_files: [],
    });
    if (doneError) throw new Error(`worker complete: ${doneError.message}`);
    await storage().remove([incomingKey(track.uploader_id, track.id)]);
    return ok(request, { completed: true });
  }
  if (action === 'fail') {
    if (typeof body.jobId !== 'string') return fail(request, 'invalid', 'A job id is required.');
    const { error } = await db().rpc('fail_upload_job', {
      p_job: body.jobId,
      p_error: "We couldn't read this file.",
    });
    if (error) throw new Error(`worker fail: ${error.message}`);
    return ok(request, { failed: true });
  }
  return fail(request, 'not_found', 'Worker action was not found.');
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
