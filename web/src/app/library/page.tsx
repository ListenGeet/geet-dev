'use client';

import Link from 'next/link';
import { useMe } from '@/components/auth/MeProvider';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';

export default function LibraryPage() {
  const { status } = useMe();
  if (status === 'guest')
    return (
      <main className="guest-page">
        <EmptyState
          title="Your music, all in one place"
          sentence="Sign in to keep favourites, playlists, history, and downloads."
          image="/illustrations/no-downloads.svg"
          action={
            <Link className="btn btn-primary" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );
  return (
    <main className="guest-page">
      <h1>Library</h1>
      <p>Your favourites, playlists, and downloads will appear here.</p>
    </main>
  );
}
