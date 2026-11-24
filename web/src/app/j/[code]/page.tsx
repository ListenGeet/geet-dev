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
    <main className="page flex-center" style={{ minHeight: '60vh', textAlign: 'center' }}>
      {error ? (
        <div>
          <h2>We couldn&apos;t find that code</h2>
          <p className="hint-text">{error}</p>
          <div className="action-row" style={{ marginTop: 20 }}>
            <Link href="/jam" className="btn btn-primary">
              Start your own
            </Link>
            <Link href="/" className="btn btn-secondary">
              Back
            </Link>
          </div>
        </div>
      ) : (
        <p className="hint-text">Joining jam {code.toUpperCase()}…</p>
      )}
    </main>
  );
}
