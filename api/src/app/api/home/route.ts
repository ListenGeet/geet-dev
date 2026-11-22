import { latestTracks, popularTracks, popularArtistCards } from '@/lib/catalogue';
import { ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:home`, 60, 60);
    if (blocked) return blocked;
    const language = new URL(request.url).searchParams.get('language') ?? undefined;
    const [newTracks, popular, artists] = await Promise.all([
      latestTracks(12, { language }),
      popularTracks(10, language),
      popularArtistCards(language ? [language] : [], 12),
    ]);
    return ok(request, { newTracks, popular, artists, promos: [], personalized: false });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
