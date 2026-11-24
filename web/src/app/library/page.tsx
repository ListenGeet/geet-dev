'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { DownloadSimple, Heart, ListBullets, Plus, SquaresFour } from '@phosphor-icons/react';
import { Icon } from '@/components/Icon';
import { EmptyState, TrackRows } from '@/components/catalogue/CatalogueComponents';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';
import {
  offlineTrack,
  offlineUsage,
  readOffline,
  removeOffline,
  type OfflineItem,
} from '@/lib/offline';

type Tab = 'Playlists' | 'Favourites' | 'Downloads' | 'History';
type Playlist = {
  id: string;
  name: string;
  kind: string;
  playlist_tracks?: { track_id: string; position: number; tracks: Track | null }[];
};
type HistoryItem = { id: string; track_id: string; played_at: string; tracks: Track | null };
const TABS: Tab[] = ['Playlists', 'Favourites', 'Downloads', 'History'];

export default function LibraryPage() {
  const { status, api } = useMe();
  const player = usePlayer();
  const [tab, setTab] = useState<Tab>('Playlists');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favourites, setFavourites] = useState<{ track_id: string; tracks: Track | null }[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [downloads, setDownloads] = useState<OfflineItem[]>([]);
  const [used, setUsed] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const refresh = useCallback(async () => {
    if (status !== 'ready') return;
    try {
      const [p, f, h] = await Promise.all([
        api<{ items: Playlist[] }>('/api/playlists'),
        api<{ items: { track_id: string; tracks: Track | null }[] }>('/api/favorites'),
        api<{ items: HistoryItem[] }>('/api/history?limit=100'),
      ]);
      setPlaylists(p.items);
      setFavourites(f.items);
      setHistory(h.items);
    } catch {
      setMessage('Could not refresh your library.');
    }
  }, [api, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (TABS.includes(requestedTab as Tab)) setTab(requestedTab as Tab);
    const reload = async () => {
      let current = readOffline();
      if (navigator.onLine && current.length) {
        try {
          const result = await api<{ removed: string[] }>(
            `/api/downloads/check?${current.map((item) => `id=${encodeURIComponent(item.id)}`).join('&')}`,
          );
          for (const id of result.removed) await removeOffline(id);
          current = readOffline();
        } catch {
          /* purge on the next online visit */
        }
      }
      setDownloads(current);
      setUsed(await offlineUsage());
    };
    void reload();
    const sync = () => {
      setOnline(navigator.onLine);
      void reload();
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [api]);

  async function createPlaylist() {
    const name = window.prompt('Name your playlist');
    if (!name?.trim()) return;
    setBusy(true);
    try {
      await api('/api/playlists', { method: 'POST', body: { name } });
      await refresh();
      setTab('Playlists');
    } catch {
      setMessage('Could not create that playlist.');
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (!window.confirm('Clear your listening history?')) return;
    try {
      await api('/api/history', { method: 'DELETE' });
      setHistory([]);
      setMessage('History cleared.');
    } catch {
      setMessage('Could not clear history.');
    }
  }

  async function deleteDownload(id: string) {
    await removeOffline(id);
    setDownloads(readOffline());
    setUsed(await offlineUsage());
  }

  if (status === 'loading')
    return (
      <main className="page">
        <p>Loading your library…</p>
      </main>
    );
  if (status === 'guest')
    return (
      <main className="guest-page">
        <EmptyState
          title="Your music, all in one place"
          sentence="Sign in to keep favourites, playlists, history, and downloads."
          image="/illustrations/no-downloads.svg"
          action={
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );

  const favoriteTracks = favourites.flatMap((item) => (item.tracks ? [item.tracks] : []));
  if (sort === 'name') favoriteTracks.sort((a, b) => a.title.localeCompare(b.title));
  const historyTracks = history.flatMap((item) => (item.tracks ? [item.tracks] : []));
  const visiblePlaylists = [...playlists].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : 0,
  );
  return (
    <main className="page library-page">
      {!online ? (
        <div className="guest-strip" role="status">
          You’re offline. Saved songs are ready in Downloads.
        </div>
      ) : null}
      <header className="library-intro">
        <div className="library-intro-copy">
          <span className="library-eyebrow">YOUR MUSIC, YOUR WAY</span>
          <h1>Your Library</h1>
          <p>Everything you save, ready when you are.</p>
        </div>
        {tab === 'Playlists' ? (
          <button
            className="btn btn-primary library-create-button"
            disabled={busy}
            onClick={() => void createPlaylist()}
          >
            <Icon icon={Plus} size={18} />
            <span>Create playlist</span>
          </button>
        ) : null}
      </header>
      <nav className="library-tabs" aria-label="Library sections">
        {TABS.map((item) => (
          <button
            key={item}
            className={`chip ${tab === item ? 'chip-selected' : ''}`}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
            <span className="library-tab-count">
              {item === 'Playlists'
                ? playlists.length
                : item === 'Favourites'
                  ? favourites.length
                  : item === 'Downloads'
                    ? downloads.length
                    : history.length}
            </span>
          </button>
        ))}
      </nav>
      {tab === 'Playlists' || tab === 'Downloads' ? (
        <div className="library-tools">
          <label className="library-sort-control">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recent">Recently added</option>
              <option value="name">Name</option>
            </select>
          </label>
          <div className="library-view-toggle" aria-label="Collection layout">
            <button
              className="library-view-button"
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <Icon icon={ListBullets} size={19} />
            </button>
            <button
              className="library-view-button"
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <Icon icon={SquaresFour} size={19} />
            </button>
          </div>
        </div>
      ) : null}
      {!online && tab !== 'Downloads' ? (
        <EmptyState
          title="Needs a connection"
          sentence="Connect to the internet to open this part of your library."
          action={
            <button className="btn btn-primary" onClick={() => setTab('Downloads')}>
              Open Downloads
            </button>
          }
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {online && tab === 'Playlists' ? (
        <section className="library-playlists">
          <div className="library-collections" aria-label="Pinned collections">
            <button
              className="library-collection library-collection-favorites"
              onClick={() => setTab('Favourites')}
            >
              <span className="library-collection-icon">
                <Icon icon={Heart} size={22} on />
              </span>
              <span className="library-collection-copy">
                <strong>Liked songs</strong>
                <small>{favourites.length} saved tracks</small>
              </span>
              {favoriteTracks[0] ? (
                <Image
                  src={favoriteTracks[0].coverUrl ?? '/illustrations/cover-fallback.svg'}
                  alt=""
                  width={58}
                  height={58}
                  unoptimized
                />
              ) : (
                <span className="library-collection-art library-art-heart">
                  <Icon icon={Heart} size={25} on />
                </span>
              )}
            </button>
            <button
              className="library-collection library-collection-downloads"
              onClick={() => setTab('Downloads')}
            >
              <span className="library-collection-icon">
                <Icon icon={DownloadSimple} size={22} />
              </span>
              <span className="library-collection-copy">
                <strong>Downloads</strong>
                <small>{downloads.length} on this device</small>
              </span>
              {downloads[0] ? (
                <Image
                  src={downloads[0].coverUrl ?? '/illustrations/cover-fallback.svg'}
                  alt=""
                  width={58}
                  height={58}
                  unoptimized
                />
              ) : (
                <span className="library-collection-art library-art-download">
                  <Icon icon={DownloadSimple} size={25} />
                </span>
              )}
            </button>
          </div>
          <div className="library-section-heading">
            <div>
              <span className="library-eyebrow">MADE BY YOU</span>
              <h2>Your playlists</h2>
            </div>
            <span className="library-section-count">{playlists.length}</span>
          </div>
          {visiblePlaylists.length ? (
            <div className={`track-list ${view === 'grid' ? 'library-grid' : ''}`}>
              {visiblePlaylists.map((list) => (
                <Link className="track-row" href={`/playlist/${list.id}`} key={list.id}>
                  <span className="track-row-main">
                    <strong>{list.name}</strong>
                    <small>{list.playlist_tracks?.length ?? 0} songs</small>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Make it yours"
              sentence="Create a playlist for the songs you want to hear together."
              action={
                <button className="btn btn-primary" onClick={() => void createPlaylist()}>
                  Create playlist
                </button>
              }
            />
          )}
        </section>
      ) : null}
      {online && tab === 'Favourites' ? (
        favoriteTracks.length ? (
          <TrackRows tracks={favoriteTracks} source="Favourites" />
        ) : (
          <EmptyState
            title="No favourites yet"
            sentence="Tap the heart on a song to keep it close."
          />
        )
      ) : null}
      {tab === 'Downloads' ? (
        <section>
          <div className="storage-meter">
            <strong>Storage used</strong>
            <span>{(used / 1024 / 1024).toFixed(1)} MB</span>
            <progress
              max={250 * 1024 * 1024}
              value={Math.min(used, 250 * 1024 * 1024)}
              aria-label="Offline storage used"
            />
          </div>
          {downloads.length ? (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  if (window.confirm('Remove all downloaded songs from this device?')) {
                    void Promise.all(downloads.map((item) => removeOffline(item.id))).then(
                      async () => {
                        setDownloads([]);
                        setUsed(await offlineUsage());
                      },
                    );
                  }
                }}
              >
                Remove all
              </button>
              <div className={`track-list ${view === 'grid' ? 'library-grid' : ''}`}>
                {downloads.map((item) => {
                  const track = offlineTrack(item);
                  return (
                    <div className="track-row" key={item.id}>
                      <button
                        className="track-row-main"
                        onClick={() =>
                          void player.playTrack(track, downloads.map(offlineTrack), 'Downloads')
                        }
                      >
                        <Image
                          src={item.coverUrl ?? '/illustrations/cover-fallback.svg'}
                          alt=""
                          width={48}
                          height={48}
                          unoptimized
                        />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.artist}</small>
                        </span>
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => void deleteDownload(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState
              title="No downloads yet"
              sentence="Save songs to listen when you’re offline."
            />
          )}
        </section>
      ) : null}
      {online && tab === 'History' ? (
        historyTracks.length ? (
          <>
            <div className="page-heading">
              <span>Recently played</span>
              <button className="btn btn-secondary" onClick={() => void clearHistory()}>
                Clear history
              </button>
            </div>
            <TrackRows tracks={historyTracks} source="History" />
          </>
        ) : (
          <EmptyState
            title="Nothing played yet"
            sentence="Songs you listen to will show up here."
          />
        )
      ) : null}
      {tab !== 'Downloads' && tab !== 'Playlists' ? null : null}
      {tab === 'Playlists' && favoriteTracks.length ? (
        <div className="library-secondary">
          <h2>Favourites</h2>
          <TrackRows tracks={favoriteTracks.slice(0, 5)} source="Favourites" />
        </div>
      ) : null}
      <footer className="library-settings-link">
        <Link href="/profile">Profile and settings</Link>
      </footer>
    </main>
  );
}
