import { fail, ok, clientIp } from '@/lib/http';
import { searchTrackRows } from '@/lib/catalogue';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:search`, 60, 60);
    if (blocked) return blocked;
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim();
    const type = url.searchParams.get('type') ?? 'all';
    const language = url.searchParams.get('language') ?? undefined;
    if (query.length > 120) return fail(request, 'invalid', 'Search up to 120 characters.');
    if (!['all', 'songs', 'artists'].includes(type))
      return fail(request, 'invalid', 'Choose songs, artists, or all results.');
    if (!query) return ok(request, { top: null, songs: [], artists: [] });
    const tracks = await searchTrackRows(query, type === 'songs' ? 30 : 100, language);
    const groups = new Map<
      string,
      { key: string; name: string; coverUrl: string; plays: number }
    >();
    for (const track of tracks) {
      const key = track.artist.normalize('NFKC').trim().toLocaleLowerCase('en');
      const previous = groups.get(key);
      if (!previous)
        groups.set(key, { key, name: track.artist, coverUrl: track.coverUrl, plays: 1 });
      else previous.plays++;
    }
    const artists = [...groups.values()].slice(0, 20);
    return ok(request, {
      top: type === 'all' ? (tracks[0] ?? null) : null,
      songs: type === 'artists' ? [] : tracks,
      artists: type === 'songs' ? [] : artists,
    });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
