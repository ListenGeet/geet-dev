'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { useLocale } from '@/lib/locale';
import { offlineUsage, readOffline, removeOffline } from '@/lib/offline';
import type { SignInDeviceItem, UserSummary } from '@geet/shared';

function vapidKeyBytes(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function subscriptionKeys(subscription: PushSubscription) {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!p256dh || !auth) return null;
  const base64Url = (key: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(key)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  return { p256dh: base64Url(p256dh), auth: base64Url(auth) };
}

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

  // Social & Devices state
  const [devices, setDevices] = useState<SignInDeviceItem[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserSummary[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPrefs, setPushPrefs] = useState({
    friend_requests: true,
    messages: true,
    jams: true,
    suggestions: true,
  });

  useEffect(() => {
    void offlineUsage().then(setDownloadBytes);
  }, []);

  const loadDevices = async () => {
    if (status !== 'ready') return;
    try {
      const data = await api<{ items: SignInDeviceItem[] }>('/api/devices');
      setDevices(data.items ?? []);
    } catch {
      // ignore
    }
  };

  const loadBlocked = async () => {
    if (status !== 'ready') return;
    try {
      const data = await api<{ items: UserSummary[] }>('/api/blocks');
      setBlockedUsers(data.items ?? []);
    } catch {
      // ignore
    }
  };

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

    void loadDevices();
    void loadBlocked();

    void api<{
      subscribed: boolean;
      prefs: typeof pushPrefs | null;
    }>('/api/push/subscribe')
      .then((result) => {
        setPushEnabled(result.subscribed);
        if (result.prefs) setPushPrefs(result.prefs);
      })
      .catch(() => undefined);

    // Check the browser still has the subscription held by the API.
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      void navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (!sub) setPushEnabled(false);
      });
    }
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

  const handleSignOutOthers = async () => {
    if (!window.confirm('Sign out all other devices?')) return;
    setWorking(true);
    try {
      await api('/api/devices/sign-out-others', { method: 'POST' });
      await loadDevices();
      setMessage('Signed out of other devices.');
    } catch {
      setMessage('Could not sign out other devices.');
    } finally {
      setWorking(false);
    }
  };

  const handleUnblock = async (targetId: string) => {
    try {
      await api(`/api/blocks/${targetId}`, { method: 'DELETE' });
      await loadBlocked();
      setMessage('User unblocked.');
    } catch {
      setMessage('Could not unblock user.');
    }
  };

  const handleTogglePush = async (enabled: boolean) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.ready;
          const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: vapidKey ? vapidKeyBytes(vapidKey) : undefined,
          });
          const keys = subscriptionKeys(sub);
          if (keys) {
            await api('/api/push/subscribe', {
              method: 'POST',
              body: { endpoint: sub.endpoint, keys, prefs: pushPrefs },
            });
            setPushEnabled(true);
            setMessage('Notifications enabled.');
          }
        } catch {
          setMessage('Could not enable push notifications.');
        }
      } else {
        setMessage('Notification permission was blocked in browser settings.');
      }
    } else {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await api('/api/push/subscribe', {
            method: 'DELETE',
            body: { endpoint: sub.endpoint },
          });
        }
        setPushEnabled(false);
        setMessage('Notifications turned off.');
      } catch {
        // ignore
      }
    }
  };

  const savePushPreferences = async (next: typeof pushPrefs) => {
    setPushPrefs(next);
    if (!pushEnabled) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const keys = sub && subscriptionKeys(sub);
      if (sub && keys) {
        await api('/api/push/subscribe', {
          method: 'POST',
          body: { endpoint: sub.endpoint, keys, prefs: next },
        });
        setMessage('Notification settings saved.');
      }
    } catch {
      setMessage('Could not save notification settings.');
    }
  };

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

      {message ? (
        <p role="status" className="toast-inline">
          {message}
        </p>
      ) : null}

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
        <label className="field">
          <span className="field-label">Who can send me friend requests</span>
          <select
            value={me.acceptRequests}
            disabled={working}
            onChange={(event) => void update({ acceptRequests: event.target.value })}
          >
            <option value="everyone">Everyone</option>
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

      {/* Push Notifications Section */}
      <section className="settings-section">
        <h2>Notifications</h2>
        <label className="settings-row">
          <span>Enable Web Push notifications</span>
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => void handleTogglePush(e.target.checked)}
          />
        </label>
        {pushEnabled && (
          <div className="sub-settings-group" style={{ paddingLeft: 16 }}>
            <label className="settings-row">
              <span>Friend requests</span>
              <input
                type="checkbox"
                checked={pushPrefs.friend_requests}
                onChange={(e) =>
                  void savePushPreferences({ ...pushPrefs, friend_requests: e.target.checked })
                }
              />
            </label>
            <label className="settings-row">
              <span>Messages</span>
              <input
                type="checkbox"
                checked={pushPrefs.messages}
                onChange={(e) =>
                  void savePushPreferences({ ...pushPrefs, messages: e.target.checked })
                }
              />
            </label>
            <label className="settings-row">
              <span>Jam invites</span>
              <input
                type="checkbox"
                checked={pushPrefs.jams}
                onChange={(e) => void savePushPreferences({ ...pushPrefs, jams: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Song suggestions</span>
              <input
                type="checkbox"
                checked={pushPrefs.suggestions}
                onChange={(e) =>
                  void savePushPreferences({ ...pushPrefs, suggestions: e.target.checked })
                }
              />
            </label>
          </div>
        )}
      </section>

      {/* Blocked People Section */}
      <section className="settings-section">
        <h2>Blocked people</h2>
        {blockedUsers.length === 0 ? (
          <p className="hint-text">You haven&apos;t blocked anyone.</p>
        ) : (
          <div className="blocked-list">
            {blockedUsers.map((u) => {
              const name = u.displayName ?? u.username ?? 'User';
              return (
                <div key={u.id} className="blocked-row flex-between">
                  <div>
                    <strong>{name}</strong>
                    {u.username && <span> (@{u.username})</span>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => handleUnblock(u.id)}
                  >
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Signed-in Devices Section (docs/05, docs/20) */}
      <section className="settings-section" id="devices">
        <h2>Signed-in devices</h2>
        <div className="devices-list">
          {devices.map((d) => (
            <div key={d.id} className="device-row flex-between">
              <div>
                <strong>{d.label ?? 'Browser'}</strong>
                {d.isCurrent && <span className="this-device-badge">This device</span>}
                <p className="device-sub">
                  {[d.city, d.country].filter(Boolean).join(', ') || 'Unknown location'} ·{' '}
                  {d.isCurrent
                    ? 'active now'
                    : `last seen ${new Date(d.lastSeen).toLocaleDateString()}`}
                </p>
              </div>
            </div>
          ))}
        </div>
        {devices.length > 1 && (
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={working}
            onClick={handleSignOutOthers}
            style={{ marginTop: 12 }}
          >
            Sign out all other devices
          </button>
        )}
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
