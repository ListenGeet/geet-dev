'use client';

import { Play } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { Icon } from '@/components/Icon';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';
import { callApi } from '@/lib/api';

export function TrackSharePage({ id }: { id: string }) {
  const { status } = useMe();
  const player = usePlayer();
  const [track, setTrack] = useState<Track | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    callApi<{ track: Track }>(`/api/tracks/${id}`)
      .then((result) => {
        if (active) setTrack(result.track);
      })
      .catch((reason: unknown) => {
        if (active) {
          setGone(reason instanceof Error && 'status' in reason && reason.status === 410);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (!track)
    return (
      <main className="share-page public-page">
        {gone ? (
          <>
            <h1>This song isn't on Geet anymore</h1>
            <Link className="btn btn-secondary" href="/search">
              Search
            </Link>
          </>
        ) : error ? (
          <>
            <h1>Couldn't load this</h1>
            <p>Check your connection and try again.</p>
          </>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    );
  return (
    <main className="share-page public-page">
      <Image
        className="share-cover"
        src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
        alt=""
        width={320}
        height={320}
        unoptimized
        onError={(event) => {
          event.currentTarget.src = '/illustrations/cover-fallback.svg';
        }}
      />
      <h1>{track.title}</h1>
      <Link className="share-artist" href={`/artist/${encodeURIComponent(track.artist)}`}>
        {track.artist}
      </Link>
      <div className="track-meta-chips">
        {track.language ? <span>{track.language}</span> : null}
        {track.genre ? <span>{track.genre}</span> : null}
      </div>
      <div className="share-actions">
        <button
          className="btn btn-primary"
          onClick={() => void player.playTrack(track, [track], 'Track share page')}
        >
          <Icon icon={Play} size={18} />
          {status === 'guest' ? 'Play 40-second preview' : 'Play'}
        </button>
        {status === 'guest' ? (
          <>
            <p>Sign in to hear the full song</p>
            <Link className="btn btn-secondary" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            <button className="btn btn-secondary" disabled title="Playlists arrive in Phase 4.">
              Add to playlist
            </button>
            <Link className="btn btn-secondary" href="/">
              Open in Geet
            </Link>
          </>
        )}
      </div>
      <Link className="report-link" href={`/copyright?track=${encodeURIComponent(track.id)}`}>
        Report this song
      </Link>
    </main>
  );
}
