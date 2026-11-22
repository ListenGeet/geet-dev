import { authenticate } from '@/lib/auth';
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
    const blocked = await limited(request, `ip:${clientIp(request)}:play`, 120, 60);
    if (blocked) return blocked;
    const caller = await authenticate(request);
    const { data: track, error } = await db()
      .from('tracks')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`play track: ${error.message}`);
    if (!track || track.status !== 'ready')
      return fail(request, 'not_found', 'That song is not available.');
    const profile = caller ? await loadOrCreateProfile(caller.sub) : null;
    const kind = profile ? 'full' : 'preview';
    const { data: file, error: fileError } = await db()
      .from('track_files')
      .select('path,size_bytes')
      .eq('track_id', id)
      .eq('kind', kind)
      .maybeSingle();
    if (fileError) throw new Error(`play file: ${fileError.message}`);
    if (!file) return fail(request, 'not_found', 'That song is not available.');
    const { error: countError } = await db().rpc('record_track_play', { p_track: id });
    if (countError) throw new Error(`play count: ${countError.message}`);
    await db().rpc('record_egress', {
      p_provider: process.env.STORAGE_PROVIDER ?? 'supabase',
      p_bytes: file.size_bytes ?? 0,
    });
    if (profile) await db().rpc('bump_usage', { p_profile: profile.id, p_field: 'plays' });
    return ok(request, {
      url: await storage().signDownload(file.path, 7200),
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
