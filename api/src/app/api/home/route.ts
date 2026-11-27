import { latestTracks, popularTracks, popularArtistCards } from '@/lib/catalogue';
import { ok, clientIp } from '@/lib/http';
import { limited, serverError } from '@/lib/route';
import { preflight } from '@/lib/cors';
import { authenticate } from '@/lib/auth';
import { loadOrCreateProfile } from '@/lib/me';
import { db } from '@/lib/db';
import { toTrackDto, type TrackRow } from '@/lib/catalogue';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const blocked = await limited(request, `ip:${clientIp(request)}:home`, 60, 60);
    if (blocked) return blocked;
    const language = new URL(request.url).searchParams.get('language') ?? undefined;
    const [newTracks, popular, artists, caller] = await Promise.all([
      latestTracks(12, { language }),
      popularTracks(10, language),
      popularArtistCards(language ? [language] : [], 12),
      authenticate(request),
    ]);
    const now = new Date().toISOString();
    const { data: promoRows, error: promoError } = await db()
      .from('promos')
      .select('id,kicker,title,button_label,image_path,link,starts_at,ends_at,sort')
      .eq('active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order('sort', { ascending: true })
      .limit(10);
    if (promoError) throw new Error(`home promos: ${promoError.message}`);
    const promoLinks = await Promise.all(
      (promoRows ?? []).flatMap((row) => {
        if (typeof row.image_path !== 'string' || !row.image_path.startsWith('promos/')) return [];
        const link =
          typeof row.link === 'string' &&
          (/^\/(?!\/)[^\\\s]*$/.test(row.link) || /^https:\/\/[^\s]+$/i.test(row.link))
            ? row.link
            : '';
        if (!link) return [];
        return [
          storage()
            .signDownload(row.image_path, 259200)
            .then((imageUrl) => ({
              id: row.id as string,
              kicker: typeof row.kicker === 'string' ? row.kicker : 'FEATURED',
              title: row.title as string,
              buttonLabel: typeof row.button_label === 'string' ? row.button_label : 'Listen',
              imageUrl,
              link,
            }))
            .catch(() => null),
        ];
      }),
    );
    const promos = promoLinks.filter((promo): promo is NonNullable<typeof promo> => promo !== null);
    let personalized = false;
    let jumpBack: ReturnType<typeof toTrackDto>[] = [];
    let dailyMixes: { id: string; name: string; tracks: ReturnType<typeof toTrackDto>[] }[] = [];
    let artistsYouLike: { artist: string; artistKey: string; coverUrl: string }[] = [];
    if (caller) {
      const profile = await loadOrCreateProfile(caller.sub);
      const client = db();
      const [
        { data: recent, error: recentError },
        { data: mixes, error: mixesError },
        { data: favs, error: favError },
      ] = await Promise.all([
        client
          .from('play_history')
          .select('track_id,tracks(*)')
          .eq('profile_id', profile.id)
          .order('played_at', { ascending: false })
          .limit(20),
        client
          .from('playlists')
          .select('id,name,kind,playlist_tracks(position,tracks(*))')
          .eq('owner_id', profile.id)
          .eq('kind', 'daily_mix')
          .order('mix_index'),
        client
          .from('favorites')
          .select('tracks(*)')
          .eq('profile_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);
      if (recentError || mixesError || favError)
        throw new Error(
          `personalized home: ${recentError?.message ?? mixesError?.message ?? favError?.message}`,
        );
      const unique = new Map<string, TrackRow>();
      for (const item of (recent ?? []) as unknown as {
        track_id: string;
        tracks: TrackRow | null;
      }[])
        if (item.tracks && !unique.has(item.track_id)) unique.set(item.track_id, item.tracks);
      jumpBack = [...unique.values()].slice(0, 6).map(toTrackDto);
      const candidateMixes = (mixes ?? []) as unknown as {
        id: string;
        name: string;
        kind: string;
        playlist_tracks: { position: number; tracks: TrackRow | null }[];
      }[];
      dailyMixes = candidateMixes
        .map((mix) => ({
          id: mix.id,
          name: mix.name,
          tracks: [...(mix.playlist_tracks ?? [])]
            .sort((a, b) => a.position - b.position)
            .flatMap((item) => (item.tracks ? [toTrackDto(item.tracks)] : [])),
        }))
        .filter((mix) => mix.tracks.length);
      const artistMap = new Map<string, { artist: string; artistKey: string; coverUrl: string }>();
      for (const row of (favs ?? []) as unknown as { tracks: TrackRow | null }[]) {
        const t = row.tracks;
        if (t?.artist_key && !artistMap.has(t.artist_key))
          artistMap.set(t.artist_key, {
            artist: t.artist,
            artistKey: t.artist_key,
            coverUrl: `/api/cover/${t.id}`,
          });
      }
      for (const name of profile.favourite_artists) {
        const key = name.normalize('NFKC').trim().toLowerCase();
        if (key && !artistMap.has(key))
          artistMap.set(key, {
            artist: name,
            artistKey: key,
            coverUrl: '/illustrations/cover-fallback.svg',
          });
      }
      artistsYouLike = [...artistMap.values()].slice(0, 12);
      personalized = true;
    }
    return ok(request, {
      newTracks,
      popular,
      artists,
      promos,
      personalized,
      jumpBack,
      dailyMixes,
      artistsYouLike,
    });
  } catch (error) {
    return serverError(request, error);
  }
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
