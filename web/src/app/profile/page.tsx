'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { useLocale } from '@/lib/locale';
import { offlineUsage, readOffline, removeOffline } from '@/lib/offline';

export default function ProfilePage() {
  const { me, api, refresh, status } = useMe();
  const { language, setLanguage } = useLocale();
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [downloadBytes, setDownloadBytes] = useState(0);
  const [canUpload, setCanUpload] = useState(false);
  const [uploadRows, setUploadRows] = useState<
    { id: string; title: string; status: string; error: string | null }[]
  >([]);
  useEffect(() => {
    void offlineUsage().then(setDownloadBytes);
  }, []);
  useEffect(() => {
    if (status !== 'ready') return;
    void api<{
      canUpload: boolean;
      items: { id: string; title: string; status: string; error: string | null }[];
    }>('/api/uploads')
      .then((result) => {
        setCanUpload(result.canUpload);
        setUploadRows(result.items);
      })
      .catch(() => setCanUpload(false));
  }, [api, status]);
  useEffect(() => {
    if (!me) return;
    try {
      localStorage.setItem('lg-autoplay-similar', String(me.autoplaySimilar));
    } catch {
      /* storage may be unavailable */
    }
    window.dispatchEvent(new CustomEvent('geet:autoplay-similar', { detail: me.autoplaySimilar }));
  }, [me?.autoplaySimilar]);
  async function update(body: Record<string, unknown>) {
    setWorking(true);
    setMessage('');
    try {
      await api('/api/me', { method: 'PATCH', body });
      await refresh();
      setMessage('Settings saved.');
    } catch {
      setMessage('Could not save this setting.');
    } finally {
      setWorking(false);
    }
  }
  if (status === 'loading')
    return (
      <main className="page">
        <p>Loading profile…</p>
      </main>
    );
  if (!me)
    return (
      <main className="page">
        <h1>Profile and settings</h1>
        <Link href="/sign-in">Sign in</Link>
      </main>
    );
  async function deleteAccount() {
    if (window.prompt('Type DELETE to permanently delete your account and library.') !== 'DELETE')
      return;
    const deleteUploads = window.confirm(
      'Also delete songs you uploaded for everyone? Choose Cancel to keep those songs.',
    );
    setWorking(true);
    try {
      await api('/api/me', { method: 'DELETE', body: { confirm: 'DELETE', deleteUploads } });
      window.location.assign('/');
    } catch {
      setMessage('Could not delete the account. Try again.');
      setWorking(false);
    }
  }
  return (
    <main className="page profile-page">
      <Link href="/library">Your Library</Link>
      <h1>Profile and settings</h1>
      <p>{me.displayName ?? me.username ?? 'Geet listener'}</p>
      <div className="profile-stats">
        <span>
          <strong>{me.counts.favourites}</strong> Favourites
        </span>
        <span>
          <strong>{me.counts.playlists}</strong> Playlists
        </span>
        <span>
          <strong>{me.counts.friends}</strong> Friends
        </span>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <section className="settings-section">
        <h2>Language</h2>
        <label className="field">
          <span className="field-label">App language</span>
          <select
            value={language}
            disabled={working}
            onChange={(event) => {
              const next = event.target.value as 'en' | 'pa' | 'hi';
              setLanguage(next);
              setMessage('Language updated.');
            }}
          >
            <option value="en">English</option>
            <option value="pa">Punjabi</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Music languages</span>
          <select
            multiple
            value={me.musicLanguages ?? []}
            disabled={working}
            onChange={(event) =>
              void update({
                musicLanguages: [...event.currentTarget.selectedOptions].map(
                  (option) => option.value,
                ),
              })
            }
          >
            <option value="pa">Punjabi</option>
            <option value="hi">Hindi</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">Artists you like (comma separated)</span>
          <input
            key={me.favouriteArtists?.join(',') ?? ''}
            defaultValue={me.favouriteArtists?.join(', ') ?? ''}
            disabled={working}
            onBlur={(event) => {
              const artists = event.currentTarget.value
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean)
                .slice(0, 50);
              void update({ favouriteArtists: artists });
            }}
          />
        </label>
      </section>
      <section className="settings-section">
        <h2>Privacy and email</h2>
        <label className="field">
          <span className="field-label">Who can see what you’re listening to</span>
          <select
            value={me.showListening}
            disabled={working}
            onChange={(event) => void update({ showListening: event.target.value })}
          >
            <option value="friends">Friends</option>
            <option value="nobody">Nobody</option>
          </select>
        </label>
        <label className="settings-row">
          <span>Email news</span>
          <input
            type="checkbox"
            checked={me.emailNews}
            disabled={working}
            onChange={(event) => void update({ emailNews: event.target.checked })}
          />
        </label>
      </section>
      <section className="settings-section">
        <h2>Playback</h2>
        <label className="settings-row">
          <span>Autoplay similar songs</span>
          <input
            type="checkbox"
            checked={me.autoplaySimilar}
            disabled={working}
            onChange={(event) => void update({ autoplaySimilar: event.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Show lyrics in the player</span>
          <input
            type="checkbox"
            checked={me.showLyrics}
            disabled={working}
            onChange={(event) => void update({ showLyrics: event.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Keep screen awake in the full player</span>
          <input
            type="checkbox"
            checked={me.keepScreenAwake}
            disabled={working}
            onChange={(event) => void update({ keepScreenAwake: event.target.checked })}
          />
        </label>
      </section>
      <section className="settings-section">
        <h2>Downloads</h2>
        <p>{(downloadBytes / 1024 / 1024).toFixed(1)} MB saved on this device</p>
        <button
          className="btn btn-secondary"
          disabled={working}
          onClick={() => {
            if (window.confirm('Remove all downloaded songs from this device?'))
              void Promise.all(readOffline().map((item) => removeOffline(item.id))).then(async () =>
                setDownloadBytes(await offlineUsage()),
              );
          }}
        >
          Remove all downloads
        </button>
      </section>
      <section className="settings-section">
        {canUpload ? (
          <>
            <h2>Your uploads</h2>
            <Link href="/upload">Manage your uploads</Link>
            {uploadRows.slice(0, 8).map((row) => (
              <p key={row.id}>
                {row.title} · {row.status === 'failed' ? (row.error ?? 'Failed') : row.status}
              </p>
            ))}
          </>
        ) : null}
      </section>
      <section className="settings-section">
        <h2>Your account</h2>
        <Link href="/library?tab=Favourites">Favourites</Link>
        <p>
          <Link href="/library?tab=Downloads">Downloads</Link>
        </p>
        <button
          className="btn btn-secondary"
          disabled={working}
          onClick={() => void deleteAccount()}
        >
          Delete account
        </button>
      </section>
      <section className="settings-section">
        <h2>About</h2>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/copyright">Copyright</Link>
      </section>
    </main>
  );
}
