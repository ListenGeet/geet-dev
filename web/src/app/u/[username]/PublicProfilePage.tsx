'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMe } from '@/components/auth/MeProvider';
import { callApi } from '@/lib/api';

type PublicProfile = { username: string; displayName: string | null; avatarUrl: string | null };

export function PublicProfilePage({ username }: { username: string }) {
  const { status } = useMe();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [missing, setMissing] = useState(false);
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
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <button
            className="btn btn-secondary"
            disabled
            title="Friend requests arrive in a later phase."
          >
            Add friend
          </button>
        )}
      </div>
    </main>
  );
}
