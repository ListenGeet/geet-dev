'use client';

import { Heart, Play } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';
import { useMe } from '@/components/auth/MeProvider';

const favoriteCache: {
  profileId: string | null;
  ids: Set<string> | null;
  pending: Promise<Set<string>> | null;
} = { profileId: null, ids: null, pending: null };

export function FavoriteButton({
  track,
  onGuestClick,
}: {
  track: Track;
  onGuestClick?: () => void;
}) {
  const { api, status, me } = useMe();
  const [saved, setSaved] = useState(false);
  const [known, setKnown] = useState(false);
  useEffect(() => {
    if (status !== 'ready' || !me) return;
    let active = true;
    if (favoriteCache.profileId !== me.id) {
      favoriteCache.profileId = me.id;
      favoriteCache.ids = null;
      favoriteCache.pending = null;
    }
    const load = favoriteCache.ids
      ? Promise.resolve(favoriteCache.ids)
      : (favoriteCache.pending ??= api<{ items: { track_id: string }[] }>('/api/favorites').then(
          ({ items }) => {
            const ids = new Set(items.map((item) => item.track_id));
            favoriteCache.ids = ids;
            return ids;
          },
        ));
    void load
      .then((ids) => {
        if (active) {
          setSaved(ids.has(track.id));
          setKnown(true);
        }
      })
      .catch(() => undefined);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; saved: boolean }>).detail;
      if (detail?.id === track.id) setSaved(detail.saved);
    };
    window.addEventListener('geet:favorite-change', changed);
    return () => {
      active = false;
      window.removeEventListener('geet:favorite-change', changed);
    };
  }, [api, me, status, track.id]);
  async function toggle() {
    if (status !== 'ready') {
      if (onGuestClick) onGuestClick();
      else window.location.assign('/sign-in');
      return;
    }
    const previous = saved;
    setKnown(true);
    setSaved(!previous);
    if (favoriteCache.ids) {
      if (previous) favoriteCache.ids.delete(track.id);
      else favoriteCache.ids.add(track.id);
    }
    window.dispatchEvent(
      new CustomEvent('geet:favorite-change', { detail: { id: track.id, saved: !previous } }),
    );
    try {
      await api('/api/favorites', {
        method: previous ? 'DELETE' : 'POST',
        body: { trackId: track.id },
      });
    } catch {
      setSaved(previous);
      if (favoriteCache.ids) {
        if (previous) favoriteCache.ids.add(track.id);
        else favoriteCache.ids.delete(track.id);
      }
      window.dispatchEvent(
        new CustomEvent('geet:favorite-change', { detail: { id: track.id, saved: previous } }),
      );
    }
  }
  return (
    <button
      className={`btn-icon ${saved ? 'is-on' : ''}`}
      type="button"
      aria-label={
        saved ? `Remove ${track.title} from favourites` : `Add ${track.title} to favourites`
      }
      aria-pressed={known ? saved : false}
      onClick={() => void toggle()}
    >
      <Icon icon={Heart} />
    </button>
  );
}

export function CoverCard({
  track,
  list,
  source = 'Home',
  priority = false,
}: {
  track: Track;
  list: Track[];
  source?: string;
  priority?: boolean;
}) {
  const player = usePlayer();
  return (
    <button className="cover-card" onClick={() => void player.playTrack(track, list, source)}>
      <span className="cover-card-image">
        <Image
          src={track.coverUrl ?? '/illustrations/cover-fallback.svg'}
          alt=""
          width={180}
          height={180}
          sizes="(max-width: 767px) 148px, 180px"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
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
          <FavoriteButton track={track} onGuestClick={() => player.openGate('favourite')} />
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
        {more ? (
          <Link href={more} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
            See all
          </Link>
        ) : null}
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
