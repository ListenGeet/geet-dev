'use client';

import { ArrowLeft, CopySimple, Play, Shuffle } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { TrackRows } from '@/components/catalogue/CatalogueComponents';
import { Icon } from '@/components/Icon';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';
import { callApi } from '@/lib/api';

type ArtistData = { name: string; tracks: Track[] };

export function ArtistPage({ artistKey }: { artistKey: string }) {
  const player = usePlayer();
  const { status } = useMe();
  const [data, setData] = useState<ArtistData | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let mounted = true;
    callApi<ArtistData>(`/api/artists/${encodeURIComponent(artistKey)}`)
      .then((value) => {
        if (mounted) setData(value);
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, [artistKey]);

  if (!data)
    return (
      <main className="public-page">
        <div className="empty-state">
          {error ? (
            <>
              <Image
                src="/illustrations/no-results.svg"
                alt=""
                width={240}
                height={200}
                unoptimized
              />
              <h2>We don't have that artist</h2>
              <p>Search Geet for songs and artists.</p>
              <Link className="btn btn-secondary" href="/search">
                <Icon icon={ArrowLeft} size={18} /> Search
              </Link>
            </>
          ) : (
            <p>Loading…</p>
          )}
        </div>
      </main>
    );
  const popular = data.tracks.slice(0, 5);
  return (
    <main className="public-page artist-page">
      <header className="artist-hero">
        <Image
          className="artist-avatar"
          src={data.tracks[0]?.coverUrl ?? '/illustrations/cover-fallback.svg'}
          alt=""
          width={160}
          height={160}
          unoptimized
        />
        <div>
          <small>Artist</small>
          <h1>{data.name}</h1>
          <p>{data.tracks.length} songs</p>
        </div>
      </header>
      <div className="artist-actions">
        <button
          className="play-control play-control-large"
          aria-label={`Play ${data.name}`}
          onClick={() =>
            data.tracks[0] && void player.playTrack(data.tracks[0], data.tracks, data.name)
          }
        >
          <Icon icon={Play} size={28} />
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (data.tracks[0])
              void player.playTrack(
                data.tracks[Math.floor(Math.random() * data.tracks.length)]!,
                data.tracks,
                data.name,
              );
          }}
        >
          <Icon icon={Shuffle} size={18} /> Shuffle
        </button>
        <button
          className="btn btn-secondary"
          disabled={status !== 'guest'}
          title="Favourites arrive in a later phase."
          onClick={() => player.openGate('favourite')}
        >
          Add to favourite artists
        </button>
        <button
          className="btn-icon"
          aria-label="Copy artist link"
          onClick={() => {
            void navigator.clipboard?.writeText(location.href).then(() => setCopied(true));
          }}
        >
          <Icon icon={CopySimple} />
        </button>
        {copied ? <small role="status">Link copied</small> : null}
      </div>
      <section className="catalogue-section">
        <header>
          <h2>Popular</h2>
        </header>
        <TrackRows tracks={popular} source={data.name} />
      </section>
      <section className="catalogue-section">
        <header>
          <h2>All songs</h2>
        </header>
        <TrackRows tracks={data.tracks} source={data.name} />
      </section>
    </main>
  );
}
