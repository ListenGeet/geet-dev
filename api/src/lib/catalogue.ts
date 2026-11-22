import { db } from './db';
import * as repo from './repo';

export interface TrackRow {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  language: string | null;
  genre: string | null;
  duration_ms: number | null;
  waveform: number[] | null;
  plays?: number;
  artist_key?: string;
  created_at?: string;
  status?: string;
}

export interface TrackDto {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  language: string | null;
  genre: string | null;
  durationMs: number | null;
  waveform: number[] | null;
  coverUrl: string;
}

export function toTrackDto(track: TrackRow): TrackDto {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    language: track.language,
    genre: track.genre,
    durationMs: track.duration_ms,
    waveform: track.waveform,
    coverUrl: `/api/cover/${track.id}`,
  };
}

function rows<T>(data: unknown, error: { message: string } | null, label: string): T[] {
  if (error) throw new Error(`${label}: ${error.message}`);
  return (data as T[] | null) ?? [];
}

const TRACK_COLUMNS =
  'id,title,artist,album,language,genre,duration_ms,waveform,plays,artist_key,created_at,status';

export async function latestTracks(
  limit = 12,
  filters: { language?: string; genre?: string } = {},
) {
  let query = db()
    .from('tracks')
    .select(TRACK_COLUMNS)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (filters.language) query = query.eq('language', filters.language);
  if (filters.genre) query = query.eq('genre', filters.genre);
  const data = await query;
  return rows<TrackRow>(data.data, data.error, 'latest tracks').map(toTrackDto);
}

export async function popularTracks(limit = 10, language?: string) {
  const { data, error } = await db().rpc('popular_tracks', {
    p_language: language ?? null,
    p_days: 7,
    p_limit: limit,
  });
  return rows<TrackRow>(data, error, 'popular tracks').map(toTrackDto);
}

export async function searchTrackRows(query: string, limit = 30, language?: string) {
  const { data, error } = await db().rpc('search_tracks', {
    p_q: query,
    p_language: language ?? null,
    p_limit: Math.min(Math.max(limit, 1), 100),
    p_offset: 0,
  });
  return rows<TrackRow>(data, error, 'track search').map(toTrackDto);
}

export async function artistPage(key: string) {
  const normalized = key.normalize('NFKC').trim().toLocaleLowerCase('en');
  const { data, error } = await db()
    .from('tracks')
    .select(TRACK_COLUMNS)
    .eq('status', 'ready')
    .eq('artist_key', normalized)
    .order('plays', { ascending: false })
    .limit(100);
  const tracks = rows<TrackRow>(data, error, 'artist tracks');
  if (!tracks.length) return null;
  return {
    name: tracks[0]?.artist ?? normalized,
    tracks: tracks.map(toTrackDto),
  };
}

export async function browseValues(column: 'language' | 'genre') {
  const { data, error } = await db()
    .from('tracks')
    .select(column)
    .eq('status', 'ready')
    .not(column, 'is', null)
    .order(column)
    .limit(2000);
  const values = rows<Record<string, string | null>>(data, error, `browse ${column}`);
  return [...new Set(values.map((row) => row[column]?.trim()).filter((v): v is string => !!v))];
}

export async function popularArtistCards(languages: string[], limit = 12) {
  const artists = await repo.topArtists(languages, limit);
  if (!artists.length) return [];
  const { data, error } = await db()
    .from('tracks')
    .select('artist_key,id,plays')
    .eq('status', 'ready')
    .in(
      'artist_key',
      artists.map((artist) => artist.artistKey),
    )
    .order('plays', { ascending: false })
    .limit(limit * 8);
  if (error) throw new Error(`popular artist covers: ${error.message}`);
  const covers = new Map<string, string>();
  for (const row of (data ?? []) as { artist_key: string; id: string }[])
    if (!covers.has(row.artist_key)) covers.set(row.artist_key, `/api/cover/${row.id}`);
  return artists.map((artist) => ({
    ...artist,
    coverUrl: covers.get(artist.artistKey) ?? '/illustrations/cover-fallback.svg',
  }));
}

export async function trackById(id: string) {
  const { data, error } = await db()
    .from('tracks')
    .select(TRACK_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`track lookup: ${error.message}`);
  return data ? (data as TrackRow) : null;
}

export async function lyricsByTrack(id: string) {
  const { data, error } = await db()
    .from('track_lyrics')
    .select('plain,synced')
    .eq('track_id', id)
    .maybeSingle();
  if (error) throw new Error(`track lyrics: ${error.message}`);
  return (data as { plain: string | null; synced: unknown | null } | null) ?? null;
}
