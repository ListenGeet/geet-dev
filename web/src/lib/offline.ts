import type { Track } from '@/components/player/types';

const AUDIO = 'geet-audio-v1';
const COVERS = 'geet-covers-v1';
const KEY = 'lg_offline';
export type OfflineItem = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  durationMs: number | null;
  savedAt: string;
};

export function readOffline(): OfflineItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as OfflineItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveOffline(
  track: Track,
  audioUrl: string,
  onProgress?: (value: number) => void,
): Promise<void> {
  if (!audioUrl) throw new Error('This song is not available to download.');
  const response = await fetch(audioUrl);
  if (!response.ok) throw new Error('Could not save this song. Try again when online.');
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('This browser cannot save songs for offline listening.');
  const parts: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      received += value.length;
      onProgress?.(total ? Math.min(99, Math.round((received / total) * 100)) : 0);
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const cache = await caches.open(AUDIO);
  await cache.put(
    `/offline-audio/${track.id}`,
    new Response(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/mp4' }), {
      headers: { 'Content-Type': 'audio/mp4', 'Content-Length': String(received) },
    }),
  );
  if (track.coverUrl) {
    try {
      const cover = await fetch(track.coverUrl);
      if (cover.ok) await (await caches.open(COVERS)).put(track.coverUrl, cover);
    } catch {
      /* cover is optional */
    }
  }
  const items = readOffline().filter((item) => item.id !== track.id);
  items.unshift({
    id: track.id,
    title: track.title,
    artist: track.artist,
    coverUrl: track.coverUrl ?? null,
    durationMs: track.durationMs ?? null,
    savedAt: new Date().toISOString(),
  });
  localStorage.setItem(KEY, JSON.stringify(items));
  onProgress?.(100);
}

export async function removeOffline(id: string): Promise<void> {
  await (await caches.open(AUDIO)).delete(`/offline-audio/${id}`);
  localStorage.setItem(KEY, JSON.stringify(readOffline().filter((item) => item.id !== id)));
}

export async function offlineUsage(): Promise<number> {
  const cache = await caches.open(AUDIO);
  const keys = await cache.keys();
  let total = 0;
  for (const key of keys)
    total += Number((await cache.match(key))?.headers.get('content-length') ?? 0);
  return total;
}

export function offlineTrack(item: OfflineItem): Track {
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    coverUrl: item.coverUrl,
    durationMs: item.durationMs,
    audioUrl: `/offline-audio/${item.id}`,
  } as Track;
}
