'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { callApi } from '@/lib/api';
import { QRCode } from '@/components/social/QRCode';

type PublicProfile = { username: string; displayName: string | null; avatarUrl: string | null };

export function PublicProfilePage({ username }: { username: string }) {
  const { me, api, status } = useMe();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    let active = true;
    callApi<PublicProfile>(`/api/users/${encodeURIComponent(username)}`)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch(() => {
        if (active) setMissing(true);
      });
    return () => {
      active = false;
    };
  }, [username]);

  if (!profile)
    return (
      <main className="public-page">
        {missing ? <h1>No one has that username.</h1> : <p>Loading…</p>}
      </main>
    );

  const name = profile.displayName ?? profile.username;
  const isMe = me?.username === profile.username;
  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/u/${profile.username}` : '';

  const handleAddFriend = async () => {
    if (sending || requestSent) return;
    setSending(true);
    try {
      await api('/api/friends/requests', {
        method: 'POST',
        body: { username: profile.username },
      });
      setRequestSent(true);
      window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Friend request sent.' }));
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent('geet:toast', {
          detail: err instanceof Error ? err.message : 'Could not send request',
        }),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="public-page public-profile-page">
      <div className="public-profile-head">
        <div className="artist-avatar">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>
        <h1>{name}</h1>
        <p>@{profile.username}</p>

        {status === 'guest' ? (
          <>
            <p>Sign in to add friends.</p>
            <Link className="btn btn-primary" href={`/sign-in?redirect_url=/u/${profile.username}`}>
              Sign in
            </Link>
          </>
        ) : isMe ? (
          <p className="hint-text">This is your public profile.</p>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={requestSent || sending}
            onClick={handleAddFriend}
          >
            {requestSent ? 'Request sent' : sending ? 'Sending…' : 'Add friend'}
          </button>
        )}

        <div className="public-profile-share" style={{ marginTop: 24 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (navigator.share && shareUrl) {
                void navigator.share({ title: name, text: `Add ${name} on Geet`, url: shareUrl });
              } else if (shareUrl) {
                void navigator.clipboard.writeText(shareUrl);
                window.dispatchEvent(new CustomEvent('geet:toast', { detail: 'Link copied.' }));
              }
            }}
          >
            Share link
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setQrOpen(!qrOpen)}
          >
            {qrOpen ? 'Hide QR' : 'Show QR'}
          </button>
        </div>

        {qrOpen && shareUrl && (
          <div className="qr-container" style={{ marginTop: 20 }}>
            <QRCode text={shareUrl} size={160} />
            <p className="qr-caption">Scan to add on Geet</p>
          </div>
        )}
      </div>
    </main>
  );
}
