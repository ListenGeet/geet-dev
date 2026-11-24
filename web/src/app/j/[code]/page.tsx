'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe } from '@/components/auth/MeProvider';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';

export default function ShortJamLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { api, status } = useMe();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'ready') {
      void api<{ id: string }>('/api/jams/join', {
        method: 'POST',
        body: { code: code.toUpperCase() },
      })
        .then((res) => router.replace(`/jam/${res.id}`))
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not join jam'));
    }
  }, [code, status, api, router]);

  if (status === 'guest') {
    return (
      <main className="guest-page">
        <EmptyState
          title="Sign in to join this jam"
          sentence="You've been invited to a live jam on Geet. Sign in to listen together."
          image="/illustrations/no-downloads.svg"
          action={
            <Link className="btn btn-primary" href={`/sign-in?redirect_url=/j/${code}`}>
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <main className="page phase5-join-page">
      {error ? (
        <div className="phase5-join-state phase5-join-error">
          <span className="social-page-eyebrow">JAM INVITE</span>
          <h1>That jam is unavailable</h1>
          <p className="hint-text">{error}</p>
          <div className="action-row">
            <Link href="/jam" className="btn btn-primary">
              Start your own
            </Link>
            <Link href="/" className="btn btn-secondary">
              Back
            </Link>
          </div>
        </div>
      ) : (
        <div className="phase5-join-state">
          <span className="social-page-eyebrow">YOU’RE INVITED</span>
          <h1>Joining the jam</h1>
          <p>
            Room code <strong>{code.toUpperCase()}</strong>
          </p>
          <p className="hint-text">Getting the music ready…</p>
        </div>
      )}
    </main>
  );
}
