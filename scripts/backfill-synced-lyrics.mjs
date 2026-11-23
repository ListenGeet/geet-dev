import { createClient } from '@supabase/supabase-js';
import { parseLyrics } from 'lyrics-lib';

const apply = process.argv.includes('--apply');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const clientName = 'Geet/1.0 (https://github.com/manpinder-Singh/geet-dev)';
const pageSize = 500;
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function getTimestampedLyrics(title, artist) {
  const query = new URLSearchParams({ track_name: title, artist_name: artist });
  const response = await fetch(`https://lrclib.net/api/get?${query}`, {
    headers: { Accept: 'application/json', 'Lrclib-Client': clientName, 'User-Agent': clientName },
    signal: AbortSignal.timeout(4_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}`);

  const body = await response.json();
  if (typeof body.syncedLyrics !== 'string' || !body.syncedLyrics.trim()) return null;
  const parsed = parseLyrics(body.syncedLyrics.slice(0, 30_000));
  return parsed.synced?.flatMap(({ text, startTime }) =>
    text.trim() && typeof startTime === 'number'
      ? [{ t_ms: Math.max(0, Math.round(startTime)), line: text.trim() }]
      : [],
  );
}

let candidates = 0;
let updated = 0;
let noSyncedMatch = 0;
let failures = 0;

for (let offset = 0; ; offset += pageSize) {
  const { data: tracks, error: trackError } = await db
    .from('tracks')
    .select('id,title,artist')
    .eq('status', 'ready')
    .order('id')
    .range(offset, offset + pageSize - 1);
  if (trackError) throw new Error(`Could not read tracks: ${trackError.message}`);
  if (!tracks?.length) break;

  const { data: rows, error: lyricsError } = await db
    .from('track_lyrics')
    .select('track_id')
    .in('track_id', tracks.map(({ id }) => id))
    .eq('source', 'lrclib')
    .is('synced', null);
  if (lyricsError) throw new Error(`Could not read lyrics: ${lyricsError.message}`);

  const byId = new Map(tracks.map((track) => [track.id, track]));
  const batch = (rows ?? []).flatMap(({ track_id }) => {
    const track = byId.get(track_id);
    return track ? [track] : [];
  });
  candidates += batch.length;

  if (apply) {
    for (const track of batch) {
      try {
        const synced = await getTimestampedLyrics(track.title, track.artist);
        if (!synced?.length) {
          noSyncedMatch += 1;
        } else {
          const { error } = await db
            .from('track_lyrics')
            .update({ synced })
            .eq('track_id', track.id)
            .eq('source', 'lrclib')
            .is('synced', null);
          if (error) throw new Error(error.message);
          updated += 1;
        }
      } catch (error) {
        failures += 1;
        console.error(`Failed to refresh lyrics for ${track.id}:`, error.message);
      }
      await pause(500);
    }
    console.log(`Checked ${Math.min(offset + pageSize, offset + tracks.length)} tracks.`);
  }

  if (tracks.length < pageSize) break;
}

if (apply) {
  console.log(`Updated ${updated}/${candidates} candidates with saved timestamps.`);
  console.log(`${noSyncedMatch} had no timestamped LRCLIB match; ${failures} failed.`);
} else {
  console.log(`Found ${candidates} LRCLIB lyric rows without saved timestamps.`);
  console.log('Run again with --apply to fetch and save available timestamps.');
}
