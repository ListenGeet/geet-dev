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

async function lookupLrclib(title, artist) {
  const query = new URLSearchParams({ track_name: title, artist_name: artist });
  const response = await fetch(`https://lrclib.net/api/get?${query}`, {
    headers: { Accept: 'application/json', 'Lrclib-Client': clientName, 'User-Agent': clientName },
    signal: AbortSignal.timeout(4_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB returned HTTP ${response.status}`);

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object') return null;
  const syncedRaw = typeof body.syncedLyrics === 'string' ? body.syncedLyrics.trim() : '';
  const plainRaw = typeof body.plainLyrics === 'string' ? body.plainLyrics.trim() : '';
  const raw = syncedRaw || plainRaw;
  if (!raw) return null;

  const parsed = parseLyrics(raw.slice(0, 30_000));
  const synced = parsed.synced?.flatMap(({ text, startTime }) =>
    text.trim() && typeof startTime === 'number'
      ? [{ t_ms: Math.max(0, Math.round(startTime)), line: text.trim() }]
      : [],
  );
  return {
    plain: plainRaw || synced?.map(({ line }) => line).join('\n') || raw,
    synced: synced?.length ? synced : null,
    source: 'lrclib',
  };
}

async function lookupLyricsOvh(title, artist) {
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': clientName },
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  if (!body || typeof body.lyrics !== 'string' || !body.lyrics.trim()) return null;
  return { plain: body.lyrics.trim().slice(0, 30_000), synced: null, source: 'lyrics_ovh' };
}

async function findLyrics(title, artist) {
  try {
    const result = await lookupLrclib(title, artist);
    if (result) return result;
  } catch {
    // Try the independent plain-lyrics provider below.
  }
  try {
    return await lookupLyricsOvh(title, artist);
  } catch {
    return null;
  }
}

let candidates = 0;
let updated = 0;
let created = 0;
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
    .select('track_id,source,synced')
    .in('track_id', tracks.map(({ id }) => id));
  if (lyricsError) throw new Error(`Could not read lyrics: ${lyricsError.message}`);

  const lyricsById = new Map((rows ?? []).map((row) => [row.track_id, row]));
  const batch = tracks.flatMap((track) => {
    const row = lyricsById.get(track.id);
    if (row && (row.source !== 'lrclib' || row.synced)) return [];
    return [{ ...track, hasLyricsRow: !!row }];
  });
  candidates += batch.length;

  if (apply) {
    for (const track of batch) {
      try {
        const found = await findLyrics(track.title, track.artist);
        if (!found?.synced?.length) {
          noSyncedMatch += 1;
        }
        if (found && track.hasLyricsRow && found.synced?.length) {
          const { error } = await db
            .from('track_lyrics')
            .update({ synced: found.synced })
            .eq('track_id', track.id)
            .eq('source', 'lrclib')
            .is('synced', null);
          if (error) throw new Error(error.message);
          updated += 1;
        } else if (found && !track.hasLyricsRow) {
          const { error } = await db.from('track_lyrics').upsert(
            { track_id: track.id, ...found },
            { onConflict: 'track_id' },
          );
          if (error) throw new Error(error.message);
          if (found.synced?.length) updated += 1;
          else created += 1;
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
  console.log(`Updated ${updated} rows with timestamps; created ${created} plain-lyrics rows.`);
  console.log(`${noSyncedMatch} had no timestamped LRCLIB match; ${failures} failed.`);
} else {
  console.log(`Found ${candidates} ready tracks with no lyrics row or unsynced LRCLIB lyrics.`);
  console.log('Run again with --apply to look up lyrics and save available timestamps.');
}
