'use client';

import { ClockCounterClockwise, Play, X } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import {
  ArtistCards,
  EmptyState,
  LoadingRows,
  Section,
  TrackRows,
} from '@/components/catalogue/CatalogueComponents';
import { Icon } from '@/components/Icon';
import { usePlayer } from '@/components/player/PlayerProvider';
import type { Track } from '@/components/player/types';
import { callApi } from '@/lib/api';
import { useLocale } from '@/lib/locale';

type ArtistHit = { key: string; name: string; coverUrl: string; plays: number };
type SearchData = { top: Track | null; songs: Track[]; artists: ArtistHit[] };

export function SearchScreen({
  initialQuery,
  initialLanguage,
  initialGenre,
}: {
  initialQuery: string;
  initialLanguage?: string;
  initialGenre?: string;
}) {
  const { status, api } = useMe();
  const { t } = useLocale();
  const player = usePlayer();
  const [query, setQuery] = useState(initialQuery);
  const [browseFilter, setBrowseFilter] = useState<{ language?: string; genre?: string }>({
    language: initialLanguage,
    genre: initialGenre,
  });
  const [type, setType] = useState<'all' | 'songs' | 'artists'>('all');
  const [data, setData] = useState<SearchData | null>(null);
  const [languages, setLanguages] = useState<string[]>(['pa', 'hi', 'en']);
  const [genres, setGenres] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
    setBrowseFilter({ language: initialLanguage, genre: initialGenre });
  }, [initialQuery, initialLanguage, initialGenre]);

  useEffect(() => {
    if (status === 'ready') {
      void api<{ items: { query: string }[] }>('/api/search/history')
        .then((result) => setRecent(result.items.map((item) => item.query)))
        .catch(() => undefined);
    } else {
      try {
        setRecent(JSON.parse(localStorage.getItem('geet-searches') ?? '[]').slice(0, 8));
      } catch {
        setRecent([]);
      }
    }
    void callApi<{ items: string[] }>('/api/browse/languages')
      .then((result) => {
        if (result.items.length) setLanguages(result.items);
      })
      .catch(() => undefined);
    void callApi<{ items: string[] }>('/api/browse/genres')
      .then((result) => setGenres(result.items))
      .catch(() => undefined);
  }, [api, status]);

  useEffect(() => {
    const cleaned = query.trim();
    const browseMode = !cleaned && (!!browseFilter.language || !!browseFilter.genre);
    if (!cleaned && !browseMode) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(false);
        const url = cleaned
          ? `/api/search?q=${encodeURIComponent(cleaned)}&type=${type}${browseFilter.language ? `&language=${encodeURIComponent(browseFilter.language)}` : ''}`
          : `/api/tracks?${new URLSearchParams(browseFilter).toString()}`;
        const request = cleaned
          ? callApi<SearchData>(url, { signal: controller.signal })
          : callApi<{ items: Track[] }>(url, { signal: controller.signal }).then((result) => ({
              top: result.items[0] ?? null,
              songs: result.items,
              artists: [],
            }));
        void request
          .then(setData)
          .catch((reason: unknown) => {
            if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError(true);
          })
          .finally(() => setLoading(false));
      },
      cleaned ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, type, browseFilter]);

  const remember = (value: string) => {
    if (!value.trim()) return;
    const cleaned = value.trim();
    const next = [cleaned, ...recent.filter((item) => item !== cleaned)].slice(0, 8);
    setRecent(next);
    if (status === 'guest') {
      try {
        localStorage.setItem('geet-searches', JSON.stringify(next));
      } catch {
        /* storage can be unavailable */
      }
    } else {
      void api('/api/search/history', { method: 'POST', body: { query: cleaned } }).catch(
        () => undefined,
      );
    }
  };

  const playResults = (track: Track) => {
    remember(query);
    void player.playTrack(track, data?.songs ?? [track], 'Search');
  };

  const tiles = (items: string[], kind: 'language' | 'genre') => (
    <div className="browse-tiles">
      {items.map((item) => (
        <Link
          className="browse-tile"
          key={item}
          href={`/search?${kind}=${encodeURIComponent(item)}`}
        >
          {kind === 'language' ? ({ pa: 'ਪੰਜਾਬੀ', hi: 'हिन्दी', en: 'English' }[item] ?? item) : item}
        </Link>
      ))}
    </div>
  );
  const browsing = !query.trim() && (!!browseFilter.language || !!browseFilter.genre);

  return (
    <main className="search-page">
      <h1>{browsing ? (browseFilter.language ?? browseFilter.genre) : t('search')}</h1>
      {!query.trim() && !browsing ? (
        <>
          {recent.length ? (
            <Section title="Recent searches">
              <div className="recent-searches">
                {recent.map((item) => (
                  <div key={item}>
                    <button
                      className="recent-query"
                      onClick={() => {
                        setQuery(item);
                        window.dispatchEvent(
                          new CustomEvent('geet:search-value', { detail: item }),
                        );
                      }}
                    >
                      <Icon icon={ClockCounterClockwise} size={20} />
                      {item}
                    </button>
                    <button
                      className="btn-icon"
                      aria-label={`Remove ${item}`}
                      onClick={() => {
                        const next = recent.filter((value) => value !== item);
                        setRecent(next);
                        if (status === 'guest') {
                          try {
                            localStorage.setItem('geet-searches', JSON.stringify(next));
                          } catch {
                            /* storage can be unavailable */
                          }
                        } else {
                          void api(`/api/search/history?q=${encodeURIComponent(item)}`, {
                            method: 'DELETE',
                          }).catch(() => undefined);
                        }
                      }}
                    >
                      <Icon icon={X} size={18} />
                    </button>
                  </div>
                ))}
                {status === 'ready' ? (
                  <button
                    className="btn btn-text"
                    onClick={() => {
                      setRecent([]);
                      void api('/api/search/history', { method: 'DELETE' }).catch(() => undefined);
                    }}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
            </Section>
          ) : null}
          <Section title="Browse by language">{tiles(languages, 'language')}</Section>
          {genres.length ? (
            <Section title="Browse by genre">{tiles(genres, 'genre')}</Section>
          ) : null}
        </>
      ) : browsing ? (
        loading ? (
          <LoadingRows />
        ) : error ? (
          <EmptyState
            title="Search needs a connection"
            sentence="Check your connection and try again."
            image="/illustrations/offline.svg"
          />
        ) : data?.songs.length ? (
          <TrackRows tracks={data.songs} source="Search" />
        ) : (
          <EmptyState title="Nothing here yet" sentence="Songs will appear here soon." />
        )
      ) : (
        <>
          <div className="search-tabs" role="tablist" aria-label="Search result type">
            {(['all', 'songs', 'artists'] as const).map((value) => (
              <button
                key={value}
                role="tab"
                aria-selected={type === value}
                className={type === value ? 'search-tab-active' : ''}
                onClick={() => setType(value)}
              >
                {value === 'all' ? 'All' : value === 'songs' ? 'Songs' : 'Artists'}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="search-results">
              <LoadingRows />
            </div>
          ) : error ? (
            <EmptyState
              title="Couldn't load this"
              sentence="Search needs a connection. Check your connection and try again."
              image="/illustrations/offline.svg"
              action={
                <button className="btn btn-secondary" onClick={() => setQuery((value) => value)}>
                  {t('tryAgain')}
                </button>
              }
            />
          ) : !data || (!data.songs.length && !data.artists.length) ? (
            <EmptyState
              title={`No songs for “${query}”`}
              sentence="Check the spelling, or search the artist's name."
              image="/illustrations/no-results.svg"
              action={
                <Link
                  className="btn btn-secondary"
                  href={`/assistant?q=${encodeURIComponent(query)}`}
                >
                  Ask Geet to find it
                </Link>
              }
            />
          ) : (
            <div className="search-results">
              {type === 'all' && data.top ? (
                <section className="search-top">
                  <Image
                    src={data.top.coverUrl ?? '/illustrations/cover-fallback.svg'}
                    alt=""
                    width={96}
                    height={96}
                    unoptimized
                  />
                  <div>
                    <small>Top result</small>
                    <h2>{data.top.title}</h2>
                    <p>{data.top.artist}</p>
                  </div>
                  <button
                    className="play-control"
                    aria-label={`Play ${data.top.title}`}
                    onClick={() => playResults(data.top!)}
                  >
                    <Icon icon={Play} />
                  </button>
                </section>
              ) : null}
              {data.songs.length ? (
                <Section
                  title="Songs"
                  more={
                    type === 'all' ? `/search?q=${encodeURIComponent(query)}&type=songs` : undefined
                  }
                >
                  <TrackRows
                    tracks={type === 'all' ? data.songs.slice(0, 4) : data.songs}
                    source="Search"
                    onSelect={() => remember(query)}
                  />
                </Section>
              ) : null}
              {data.artists.length && type !== 'songs' ? (
                <Section
                  title="Artists"
                  more={
                    type === 'all'
                      ? `/search?q=${encodeURIComponent(query)}&type=artists`
                      : undefined
                  }
                >
                  <ArtistCards
                    artists={data.artists.map((artist) => ({
                      key: artist.key,
                      artist: artist.name,
                      coverUrl: artist.coverUrl,
                    }))}
                  />
                </Section>
              ) : null}
            </div>
          )}
        </>
      )}
      {status === 'guest' && (
        <p className="search-note">You can browse and play previews without an account.</p>
      )}
    </main>
  );
}
