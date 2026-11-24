import { lyricsByTrack, trackById } from '@/lib/catalogue';
import { fail, ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:lyrics`, 60, 60);
    if (blocked) return blocked;
    const { id } = await params;
    const [track, lyrics] = await Promise.all([trackById(id), lyricsByTrack(id)]);
    if (!track || track.status !== 'ready')
      return fail(request, 'not_found', 'That song is not available.');
    return ok(request, { lyrics });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
