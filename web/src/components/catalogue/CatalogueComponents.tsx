'use client';

import { Play } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';

export function CoverCard({
  track,
  list,
  source = 'Home',
}: {
  track: Track;
  list: Track[];
  source?: string;
}) {
  const player = usePlayer();
  return (
    <button
      className="cover-card"
      onClick={() => void player.playTrack(track, list, source)}
      aria-label={`Play ${track.title} by ${track.artist}`}
    >
      <span className="cover-card-image">
        <Image
          src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
          alt=""
          width={180}
          height={180}
          unoptimized
          onError={(event) => {
            event.currentTarget.src = '/illustrations/cover-fallback.svg';
          }}
        />
        <span className="cover-card-play">
          <Icon icon={Play} size={22} />
        </span>
      </span>
      <strong>{track.title}</strong>
      <small>{track.artist}</small>
    </button>
  );
}

export function TrackRows({
  tracks,
  source = 'Search',
  ranked = false,
  onSelect,
}: {
  tracks: Track[];
  source?: string;
  ranked?: boolean;
  onSelect?: () => void;
}) {
  const player = usePlayer();
  return (
    <div className="track-list">
      {tracks.map((track, index) => (
        <div
          className={`track-row ${player.track?.id === track.id ? 'track-row-current' : ''}`}
          key={track.id}
        >
          {ranked ? <span className="track-rank">{index + 1}</span> : null}
          <div className="track-row-main">
            <Image
              src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
              alt=""
              width={48}
              height={48}
              unoptimized
              onError={(event) => {
                event.currentTarget.src = '/illustrations/cover-fallback.svg';
              }}
            />
            <span>
              <button
                className="track-title-button"
                onClick={() => {
                  onSelect?.();
                  void player.playTrack(track, tracks, source);
                }}
              >
                <strong>{track.title}</strong>
              </button>
              <small>
                <Link href={`/artist/${encodeURIComponent(track.artist)}`}>{track.artist}</Link>
                {player.isPreview && player.track?.id === track.id ? ' · Preview' : ''}
              </small>
            </span>
          </div>
          <button
            className="track-play"
            aria-label={`Play ${track.title}`}
            onClick={() => {
              onSelect?.();
              void player.playTrack(track, tracks, source);
            }}
          >
            <Icon icon={Play} size={20} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ArtistCards({
  artists,
}: {
  artists: { artist: string; artistKey?: string; key?: string; coverUrl?: string }[];
}) {
  return (
    <div className="artist-cards">
      {artists.map((artist) => {
        const name = artist.artist;
        const key = artist.artistKey ?? artist.key ?? name;
        return (
          <Link className="artist-card" href={`/artist/${encodeURIComponent(key)}`} key={key}>
            <Image
              src={artist.coverUrl ?? '/illustrations/cover-fallback.svg'}
              alt=""
              width={96}
              height={96}
              unoptimized
              onError={(event) => {
                event.currentTarget.src = '/illustrations/cover-fallback.svg';
              }}
            />
            <span>{name}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  children,
  more,
}: {
  title: string;
  children: React.ReactNode;
  more?: string;
}) {
  return (
    <section className="catalogue-section">
      <header>
        <h2>{title}</h2>
        {more ? <Link href={more}>See all</Link> : null}
      </header>
      {children}
    </section>
  );
}

export function LoadingRows() {
  return (
    <div className="skeleton-list" aria-label="Loading songs" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton-cover" />
          <span className="skeleton-copy">
            <i />
            <i />
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  sentence,
  image = '/illustrations/no-downloads.svg',
  action,
}: {
  title: string;
  sentence: string;
  image?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Image src={image} alt="" width={240} height={200} unoptimized />
      <h2>{title}</h2>
      <p>{sentence}</p>
      {action}
    </div>
  );
}
