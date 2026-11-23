'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';

type Row = { track_id: string; position: number; tracks: Track | null };
type Playlist = { id: string; name: string; kind: string; playlist_tracks: Row[] };
export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const { api } = useMe();
  const player = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await api<{ items: Playlist[] }>('/api/playlists');
      const match = result.items.find((item) => item.id === id);
      if (!match) {
        setPlaylist(null);
        return;
      }
      setPlaylist(match);
      setRows([...(match.playlist_tracks ?? [])].sort((a, b) => a.position - b.position));
    } catch {
      setMessage('Could not load this playlist.');
    }
  }, [api, id]);
  useEffect(() => {
    void load();
  }, [load]);
  function move(index: number, delta: -1 | 1) {
    const otherIndex = index + delta;
    if (otherIndex < 0 || otherIndex >= rows.length) return;
    const next = [...rows];
    const current = next[index]!;
    next[index] = next[otherIndex]!;
    next[otherIndex] = current;
    void persist(next);
  }
  function moveTo(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...rows];
    const [item] = next.splice(dragIndex, 1);
    if (item) next.splice(index, 0, item);
    setDragIndex(null);
    void persist(next);
  }
  async function persist(next: Row[]) {
    setRows(next);
    try {
      await api('/api/playlists', {
        method: 'PATCH',
        body: { id, trackIds: next.map((row) => row.track_id) },
      });
    } catch {
      setMessage('Could not save the new order.');
      await load();
    }
  }
  async function remove(trackId: string) {
    try {
      await api(`/api/playlists/${id}/tracks`, { method: 'DELETE', body: { trackId } });
      setRows((current) => current.filter((row) => row.track_id !== trackId));
    } catch {
      setMessage('Could not remove that song.');
    }
  }
  async function rename() {
    const name = window.prompt('Rename playlist', playlist?.name);
    if (!name?.trim()) return;
    try {
      await api('/api/playlists', { method: 'PATCH', body: { id, name } });
      await load();
    } catch {
      setMessage('Could not rename this playlist.');
    }
  }
  async function deleteList() {
    if (!window.confirm('Delete this playlist? The songs will stay in your library.')) return;
    try {
      await api('/api/playlists', { method: 'DELETE', body: { id } });
      window.location.assign('/library');
    } catch {
      setMessage('Could not delete this playlist.');
    }
  }
  if (!playlist)
    return (
      <main className="page">
        <p>{message || 'Loading playlist…'}</p>
        <Link href="/library">Back to Library</Link>
      </main>
    );
  const tracks = rows.flatMap((row) => (row.tracks ? [row.tracks] : []));
  return (
    <main className="page playlist-page">
      <Link href="/library">Your Library</Link>
      <header className="page-heading">
        <div>
          <p>Playlist</p>
          <h1>{playlist.name}</h1>
          <p>{tracks.length} songs</p>
        </div>
        {playlist.kind === 'user' ? (
          <div>
            <button className="btn btn-secondary" onClick={() => void rename()}>
              Rename
            </button>{' '}
            <button className="btn btn-secondary" onClick={() => void deleteList()}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      {message ? <p role="status">{message}</p> : null}
      <div className="track-list">
        {rows.map((row, index) =>
          row.tracks ? (
            <div
              className="track-row"
              key={row.track_id}
              draggable={playlist.kind === 'user'}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveTo(index)}
              onTouchStart={(event) => {
                event.currentTarget.dataset.touchX = String(event.touches[0]?.clientX ?? 0);
              }}
              onTouchEnd={(event) => {
                const start = Number(event.currentTarget.dataset.touchX ?? 0);
                if (start - (event.changedTouches[0]?.clientX ?? start) > 80)
                  void remove(row.track_id);
              }}
            >
              <button
                className="track-row-main"
                onClick={() => void player.playTrack(row.tracks!, tracks, playlist.name)}
              >
                <Image
                  src={row.tracks.coverUrl ?? '/illustrations/cover-fallback.svg'}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                />
                <span>
                  <strong>{row.tracks.title}</strong>
                  <small>{row.tracks.artist}</small>
                </span>
              </button>
              {playlist.kind === 'user' ? (
                <div>
                  <button
                    className="btn btn-secondary"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>{' '}
                  <button
                    className="btn btn-secondary"
                    aria-label="Move down"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>{' '}
                  <button className="btn btn-secondary" onClick={() => void remove(row.track_id)}>
                    Remove
                  </button>
                </div>
              ) : null}
            </div>
          ) : null,
        )}
      </div>
    </main>
  );
}
