import { authenticate } from '@/lib/auth';
import { after } from 'next/server';
import { db } from '@/lib/db';
import { clientIp, fail, ok } from '@/lib/http';
import { loadOrCreateProfile } from '@/lib/me';
import { storage } from '@/lib/storage';
import { limited } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    if (!uuid.test(id)) return fail(request, 'not_found', 'That song is not available.');
    const [blocked, caller] = await Promise.all([
      limited(request, `ip:${clientIp(request)}:play`, 120, 60),
      authenticate(request),
    ]);
    if (blocked) return blocked;
    const [trackResult, profile, filesResult] = await Promise.all([
      db().from('tracks').select('id,status').eq('id', id).maybeSingle(),
      caller ? loadOrCreateProfile(caller.sub) : Promise.resolve(null),
      db()
        .from('track_files')
        .select('kind,path,size_bytes')
        .eq('track_id', id)
        .in('kind', ['full', 'preview']),
    ]);
    const { data: track, error } = trackResult;
    if (error) throw new Error(`play track: ${error.message}`);
    const { data: files, error: fileError } = filesResult;
    if (fileError) throw new Error(`play file: ${fileError.message}`);
    if (!track || track.status !== 'ready')
      return fail(request, 'not_found', 'That song is not available.');
    const kind = profile ? 'full' : 'preview';
    const file = files?.find((candidate) => candidate.kind === kind);
    if (!file) return fail(request, 'not_found', 'That song is not available.');
    const url = await storage().signDownload(file.path, 7200);
    after(async () => {
      try {
        const counters = [
          db().rpc('record_track_play', { p_track: id }),
          db().rpc('record_egress', {
            p_provider: process.env.STORAGE_PROVIDER ?? 'supabase',
            p_bytes: file.size_bytes ?? 0,
          }),
          ...(profile ? [db().rpc('bump_usage', { p_profile: profile.id, p_field: 'plays' })] : []),
        ];
        const results = await Promise.all(counters);
        const failed = results.find((result) => result.error)?.error;
        if (failed) throw new Error(failed.message);
      } catch (error) {
        console.error(
          '[api] play counter error:',
          error instanceof Error ? error.message : 'unknown',
        );
      }
    });
    return ok(request, {
      url,
      expiresAt: new Date(Date.now() + 7_200_000).toISOString(),
      preview: kind === 'preview',
    });
  } catch (error) {
    console.error('[api] play error:', error instanceof Error ? error.message : 'unknown');
    return fail(request, 'server_error', 'The song could not be played right now.');
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
