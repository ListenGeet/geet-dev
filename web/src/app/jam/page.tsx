'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UsersThree } from '@phosphor-icons/react';
import { useMe } from '@/components/auth/MeProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';
import { isValidJamCode } from '@geet/shared';

export default function JamHubPage() {
  const { api, status } = useMe();
  const player = usePlayer();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (status === 'guest') {
    return (
      <main className="guest-page">
        <EmptyState
          title="Start or join a jam"
          sentence="Sign in free to listen to the same song at the same moment with friends."
          image="/illustrations/no-downloads.svg"
          action={
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  const handleStartJam = async () => {
    setLoading(true);
    setError('');
    try {
      const jam = await api<{ id: string }>('/api/jams', {
        method: 'POST',
        body: { trackId: player.track?.id },
      });
      router.push(`/jam/${jam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create jam');
      setLoading(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean || !isValidJamCode(clean)) {
      setError('Please enter a valid 6-character code.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const jam = await api<{ id: string }>('/api/jams/join', {
        method: 'POST',
        body: { code: clean },
      });
      router.push(`/jam/${jam.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join jam');
      setLoading(false);
    }
  };

  return (
    <main className="page jam-hub-page">
      <header className="page-header">
        <h1>Jams</h1>
        <p className="page-sub">Listen to music together with friends in real time.</p>
      </header>

      <div className="jam-hub-card">
        <Icon icon={UsersThree} size={48} />
        <h2>Start a jam</h2>
        <p>You&apos;ll be the host and can invite up to 7 friends to hear your music.</p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={loading}
          onClick={handleStartJam}
        >
          {loading ? 'Starting…' : 'Start a jam'}
        </button>
      </div>

      <div className="jam-hub-card">
        <h2>Join with a code</h2>
        <p>Enter the 6-character code shared by your friend.</p>

        <form onSubmit={handleJoinByCode} className="join-code-form">
          <input
            type="text"
            className="field-input code-input"
            placeholder="ABC123"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
          />
          <button
            type="submit"
            className="btn btn-secondary btn-block"
            disabled={loading || !code.trim()}
          >
            Join jam
          </button>
        </form>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
