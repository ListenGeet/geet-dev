import { getLyrics, parseLyrics } from 'lyrics-lib';
import { db } from './db';

export type LyricsSource = 'lrclib' | 'lyrics_ovh';
export type StoredLyrics = {
  plain: string | null;
  synced: { t_ms: number; line: string }[] | null;
  source: LyricsSource;
};

const MAX_LYRICS_LENGTH = 30_000;

export function normalizeLyrics(
  raw: string | null | undefined,
): Omit<StoredLyrics, 'source'> | null {
  const text = raw?.trim().slice(0, MAX_LYRICS_LENGTH);
  if (!text) return null;

  const parsed = parseLyrics(text);
  const synced = parsed.synced?.flatMap(({ text: line, startTime }) =>
    line.trim() && typeof startTime === 'number'
      ? [{ t_ms: Math.max(0, Math.round(startTime)), line: line.trim() }]
      : [],
  );
  const plain = parsed.unsynced
    .map(({ text: line }) => line.trim())
    .filter(Boolean)
    .join('\n');

  return {
    plain: plain || synced?.map(({ line }) => line).join('\n') || text,
    synced: synced?.length ? synced : null,
  };
}

async function lookupLyricsOvh(title: string, artist: string): Promise<string | null> {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Geet/1.0 (https://github.com/manpinder-Singh/geet-dev)',
    },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('lyrics' in body) || typeof body.lyrics !== 'string') {
    return null;
  }
  return body.lyrics;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('lyrics lookup timed out')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function findLyrics(
  title: string,
  artist: string,
  primary: (title: string, artist: string) => Promise<string | null> = async (
    trackTitle,
    trackArtist,
  ) => getLyrics({ title: trackTitle, artist: trackArtist }),
  fallback: (title: string, artist: string) => Promise<string | null> = lookupLyricsOvh,
): Promise<StoredLyrics | null> {
  const cleanTitle = title.trim();
  const cleanArtist = artist.trim();
  if (!cleanTitle || !cleanArtist) return null;

  try {
    const found = normalizeLyrics(await withTimeout(primary(cleanTitle, cleanArtist), 4_000));
    if (found) return { ...found, source: 'lrclib' };
  } catch {
    // Continue to the independent fallback if LRCLIB is unavailable.
  }

  try {
    const found = normalizeLyrics(await fallback(cleanTitle, cleanArtist));
    if (found) return { ...found, source: 'lyrics_ovh' };
  } catch {
    // Missing lyrics or an upstream outage must not fail an upload.
  }

  return null;
}

export async function fetchAndStoreLyrics(track: { id: string; title: string; artist: string }) {
  try {
    const lyrics = await findLyrics(track.title, track.artist);
    if (!lyrics) return false;
    const { error } = await db()
      .from('track_lyrics')
      .upsert({ track_id: track.id, ...lyrics }, { onConflict: 'track_id' });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(
      '[lyrics] automatic lookup failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return false;
  }
}
