import { ok, clientIp } from '@/lib/http';
import { latestTracks, popularTracks } from '@/lib/catalogue';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:tracks`, 60, 60);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const sort = url.searchParams.get('sort') ?? 'new';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 30) || 30, 1), 100);
    const items =
      sort === 'popular'
        ? await popularTracks(limit, url.searchParams.get('language') ?? undefined)
        : await latestTracks(limit, {
            language: url.searchParams.get('language') ?? undefined,
            genre: url.searchParams.get('genre') ?? undefined,
          });
    return ok(request, { items, next: null });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
