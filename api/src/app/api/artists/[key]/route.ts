import { artistPage } from '@/lib/catalogue';
import { fail, ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ key: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:artist`, 60, 60);
    if (blocked) return blocked;
    const { key } = await params;
    const artist = await artistPage(decodeURIComponent(key));
    if (!artist) return fail(request, 'not_found', "We don't have that artist.");
    return ok(request, artist);
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
