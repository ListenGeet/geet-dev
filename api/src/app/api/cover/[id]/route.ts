import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { fail } from '@/lib/http';
import { corsFor } from '@/lib/cors';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const { data: file, error } = await db()
    .from('track_files')
    .select('path')
    .eq('track_id', id)
    .eq('kind', 'cover')
    .maybeSingle();
  if (error) throw new Error(`cover lookup: ${error.message}`);
  if (!file) return fail(request, 'not_found', 'Cover not found.');
  return new Response(null, {
    status: 302,
    headers: {
      Location: await storage().signDownload(file.path, 259200),
      'Cache-Control': 'public, max-age=86400',
      ...corsFor(request),
    },
  });
}
