'use client';

import { useUser } from '@clerk/nextjs';
import { Check } from '@phosphor-icons/react';
import type { UsernameAvailability } from '@geet/shared';
import { normalizeUsername } from '@geet/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ApiError } from '@/lib/api';
import { localUsernameHint, suggestUsername } from '@/lib/username';
import { useMe } from './MeProvider';

const LANGUAGE_TILES = [
  { code: 'pa', label: 'ਪੰਜਾਬੀ', lang: 'pa' },
  { code: 'hi', label: 'हिन्दी', lang: 'hi' },
  { code: 'en', label: 'English', lang: 'en' },
] as const;

type Check = { state: 'idle' | 'checking' | 'ok' | 'yours' | 'bad'; message: string };

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="progress" role="img" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= step ? 'on' : ''} />
      ))}
    </div>
  );
}

/** Three steps, skippable except the username (docs/05). Finishing is stored, so it never repeats. */
export function Onboarding() {
  const { me, status, api, setMe } = useMe();
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [check, setCheck] = useState<Check>({ state: 'idle', message: '' });
  const [languages, setLanguages] = useState<string[]>([]);
  const [artists, setArtists] = useState<{ artist: string; artistKey: string }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [news, setNews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Prefill once: the saved username if there is one, else a guess from the Clerk name.
  useEffect(() => {
    if (touched || username) return;
    const saved = me?.username;
    const guess =
      saved ??
      suggestUsername(
        user?.username ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress?.split('@')[0],
      );
    if (guess) setUsername(guess);
  }, [me, user, touched, username]);

  // Already finished: nothing to do here.
  useEffect(() => {
    if (status === 'ready' && me?.onboarded) router.replace('/');
    if (status === 'guest') router.replace('/sign-in?redirect_url=/onboarding');
  }, [status, me, router]);

  // Live availability, after a short pause in typing.
  useEffect(() => {
    const name = normalizeUsername(username);
    const local = localUsernameHint(name);
    if (name === '') return setCheck({ state: 'idle', message: '' });
    if (local) return setCheck({ state: 'bad', message: local });
    if (status !== 'ready') return;
    setCheck({ state: 'checking', message: 'Checking…' });
    const timer = setTimeout(() => {
      api<UsernameAvailability>(`/api/usernames/${encodeURIComponent(name)}/available`)
        .then((r) => {
          if (r.yours) setCheck({ state: 'yours', message: `@${r.name} is yours` });
          else if (r.available) setCheck({ state: 'ok', message: `@${r.name} is available` });
          else setCheck({ state: 'bad', message: `@${r.name} is taken` });
        })
        .catch(() => setCheck({ state: 'idle', message: '' }));
    }, 300);
    return () => clearTimeout(timer);
  }, [username, status, api]);

  // Artists for step 3, from the languages chosen in step 2.
  useEffect(() => {
    if (step !== 3 || status !== 'ready') return;
    const query = languages.length ? `?languages=${languages.join(',')}` : '';
    api<{ items: { artist: string; artistKey: string }[] }>(`/api/artists/top${query}`)
      .then((r) => setArtists(r.items))
      .catch(() => setArtists([]));
  }, [step, languages, status, api]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveUsername = () =>
    run(async () => {
      await api('/api/me/username', {
        method: 'PUT',
        body: { username: normalizeUsername(username) },
      });
      setStep(2);
    });

  const saveLanguages = () =>
    run(async () => {
      if (languages.length)
        await api('/api/me', { method: 'PATCH', body: { musicLanguages: languages } });
      setStep(3);
    });

  const finish = (withChoices: boolean) =>
    run(async () => {
      const body = withChoices
        ? { favouriteArtists: picked, emailNews: news, onboarded: true }
        : { onboarded: true };
      setMe(await api('/api/me', { method: 'PATCH', body }));
      router.replace('/');
    });

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  if (status === 'loading' || status === 'guest')
    return <main className="onboard" aria-busy="true" />;
  if (status === 'error') {
    return (
      <main className="onboard">
        <p className="onboard-error">
          Can’t reach Geet right now. Check your connection and refresh.
        </p>
      </main>
    );
  }

  const nameReady = check.state === 'ok' || check.state === 'yours';
  return (
    <main className="onboard">
      <Progress step={step} />

      {step === 1 ? (
        <section>
          <h1>Pick a username</h1>
          <p className="onboard-lede">Friends find you by this.</p>
          <label className="field">
            <span className="field-label">Username</span>
            <span className="field-prefixed">
              <span aria-hidden="true">@</span>
              <input
                value={username}
                onChange={(e) => {
                  setTouched(true);
                  setUsername(e.target.value.toLowerCase());
                }}
                maxLength={21}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                aria-invalid={check.state === 'bad'}
                aria-describedby="username-hint"
              />
            </span>
            <span
              id="username-hint"
              className={`field-hint ${check.state === 'bad' ? 'bad' : ''}`}
              aria-live="polite"
            >
              {check.message || '3 to 20 characters: a to z, 0 to 9, underscore, dot.'}
            </span>
          </label>
          {error ? <p className="onboard-error">{error}</p> : null}
          <Button loading={busy} disabled={!nameReady} onClick={() => void saveUsername()}>
            Next
          </Button>
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1>Your languages</h1>
          <p className="onboard-lede">Home gets better straight away.</p>
          <div className="tiles" role="group" aria-label="Languages">
            {LANGUAGE_TILES.map((t) => (
              <button
                key={t.code}
                type="button"
                lang={t.lang}
                className={`tile ${languages.includes(t.code) ? 'on' : ''}`}
                aria-pressed={languages.includes(t.code)}
                onClick={() => toggle(languages, setLanguages, t.code)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {error ? <p className="onboard-error">{error}</p> : null}
          <div className="onboard-actions">
            <Button loading={busy} onClick={() => void saveLanguages()}>
              Next
            </Button>
            <Button variant="text" disabled={busy} onClick={() => setStep(3)}>
              Skip
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1>Pick a few artists</h1>
          {artists === null ? (
            <p className="onboard-lede">Loading…</p>
          ) : artists.length === 0 ? (
            <p className="onboard-lede">Artists show up here once songs are added.</p>
          ) : (
            <div className="artists" role="group" aria-label="Artists">
              {artists.map((a) => {
                const on = picked.includes(a.artist);
                return (
                  <button
                    key={a.artistKey}
                    type="button"
                    className={`artist ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(picked, setPicked, a.artist)}
                  >
                    <span className="artist-disc">
                      {on ? (
                        <Icon icon={Check} on size={28} />
                      ) : (
                        a.artist.trim().charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="artist-name">{a.artist}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="switch-row">
            <div>
              <div id="news-label">Send me news about new songs and features</div>
              <div className="field-hint">About twice a month. Unsubscribe any time.</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={news}
              aria-labelledby="news-label"
              className={`switch ${news ? 'on' : ''}`}
              onClick={() => setNews((v) => !v)}
            >
              <span />
            </button>
          </div>
          {error ? <p className="onboard-error">{error}</p> : null}
          <div className="onboard-actions">
            <Button loading={busy} onClick={() => void finish(true)}>
              Done
            </Button>
            <Button variant="text" disabled={busy} onClick={() => void finish(false)}>
              Skip
            </Button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
