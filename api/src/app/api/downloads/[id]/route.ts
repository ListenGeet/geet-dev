import { preflight } from '@/lib/cors';
import { db } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { storage } from '@/lib/storage';
import { withUser } from '@/lib/route';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET = withUser(
  async (request, _context, params: { params: Promise<{ id: string }> }) => {
    const { id } = await params.params;
    if (!uuid.test(id)) return fail(request, 'not_found', 'That song is not available.');
    const { data: track, error } = await db()
      .from('tracks')
      .select('id,status')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`download track: ${error.message}`);
    if (!track || track.status !== 'ready')
      return fail(request, 'not_found', 'That song is not available.');
    const { data: file, error: fileError } = await db()
      .from('track_files')
      .select('path')
      .eq('track_id', id)
      .eq('kind', 'full')
      .maybeSingle();
    if (fileError) throw new Error(`download file: ${fileError.message}`);
    if (!file) return fail(request, 'not_found', 'That song is not available.');
    return ok(request, { url: await storage().signDownload(file.path, 7200) });
  },
);

export function OPTIONS(request: Request) {
  return preflight(request);
}
