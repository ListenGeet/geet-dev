'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import {
  ArtistCards,
  CoverCard,
  EmptyState,
  LoadingRows,
  Section,
  TrackRows,
} from '@/components/catalogue/CatalogueComponents';
import type { Track } from '@/components/player/types';
import { callApi } from '@/lib/api';
import { useLocale } from '@/lib/locale';

export type HomeData = {
  newTracks: Track[];
  popular: Track[];
  artists: { artist: string; artistKey: string; plays: number }[];
  personalized?: boolean;
  jumpBack?: Track[];
  dailyMixes?: { id: string; name: string; tracks: Track[] }[];
  artistsYouLike?: { artist: string; artistKey: string; coverUrl: string }[];
};

const languages = [
  { value: '', label: 'All' },
  { value: 'pa', label: 'ਪੰਜਾਬੀ' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'en', label: 'English' },
];

export default function HomePage({ initialData }: { initialData: HomeData | null }) {
  const { status, api } = useMe();
  const { t } = useLocale();
  const [language, setLanguage] = useState('');
  const [languageReady, setLanguageReady] = useState(false);
  const [data, setData] = useState<HomeData | null>(initialData);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(initialData === null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    try {
      setLanguage(localStorage.getItem('geet-home-language') ?? '');
    } catch {
      setLanguage('');
    }
    setLanguageReady(true);
  }, []);
  useEffect(() => {
    if (!languageReady) return;
    try {
      localStorage.setItem('geet-home-language', language);
    } catch {
      /* storage can be unavailable */
    }
  }, [language, languageReady]);
  useEffect(() => {
    if (!languageReady) return;
    if (initialData && language === '' && reload === 0 && status !== 'ready') return;
    let active = true;
    setLoading(true);
    setError(false);
    (status === 'ready'
      ? api<HomeData>(`/api/home${language ? `?language=${encodeURIComponent(language)}` : ''}`)
      : callApi<HomeData>(`/api/home${language ? `?language=${encodeURIComponent(language)}` : ''}`)
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, initialData, language, languageReady, reload, status]);
  return (
    <main className="home-page">
      {status === 'guest' ? (
        <div className="guest-strip">
          <p>{t('previewStrip')}</p>
          <Link href="/sign-in">{t('signIn')}</Link>
        </div>
      ) : null}
      <div className="language-filters" aria-label="Filter by language">
        {languages.map((item) => (
          <button
            key={item.value}
            className={`chip ${language === item.value ? 'chip-selected' : ''}`}
            aria-pressed={language === item.value}
            onClick={() => setLanguage(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? (
        <>
          <Section title={t('newOnGeet')}>
            <LoadingRows />
          </Section>
          <Section title={t('popularWeek')}>
            <LoadingRows />
          </Section>
        </>
      ) : error ? (
        <EmptyState
          title="Couldn't load this"
          sentence="Check your connection and try again."
          image="/illustrations/error.svg"
          action={
            <button className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>
              {t('tryAgain')}
            </button>
          }
        />
      ) : !data?.newTracks.length ? (
        <EmptyState title={t('nothing')} sentence={t('songsSoon')} />
      ) : (
        <>
          {data.personalized && data.jumpBack?.length ? (
            <Section title="Jump back in">
              <TrackRows tracks={data.jumpBack} source="Jump back in" />
            </Section>
          ) : null}
          {data.personalized && data.dailyMixes?.length ? (
            <Section title="Made for you">
              <div className="cover-cards">
                {data.dailyMixes.map((mix) => (
                  <Link className="cover-card" href={`/playlist/${mix.id}`} key={mix.id}>
                    <span className="cover-card-image">
                      <Image
                        src={mix.tracks[0]?.coverUrl ?? '/illustrations/cover-fallback.svg'}
                        alt=""
                        width={180}
                        height={180}
                        unoptimized
                      />
                    </span>
                    <strong>{mix.name}</strong>
                    <small>{mix.tracks.length} songs</small>
                  </Link>
                ))}
              </div>
            </Section>
          ) : null}
          {data.personalized && data.artistsYouLike?.length ? (
            <Section title="Artists you like">
              <ArtistCards artists={data.artistsYouLike} />
            </Section>
          ) : null}
          <Section title={t('newOnGeet')} more="/search?sort=new">
            <div className="cover-cards">
              {data.newTracks.map((track, index) => (
                <CoverCard
                  key={track.id}
                  track={track}
                  list={data.newTracks}
                  priority={index === 0}
                />
              ))}
            </div>
          </Section>
          {data.popular.length ? (
            <Section title={t('popularWeek')} more="/search?sort=popular">
              <TrackRows tracks={data.popular} ranked source="Home" />
            </Section>
          ) : null}
          {data.artists.length ? (
            <Section title={t('popularArtists')}>
              <ArtistCards artists={data.artists} />
            </Section>
          ) : null}
        </>
      )}
    </main>
  );
}
