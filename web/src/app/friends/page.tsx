'use client';

import Link from 'next/link';
import { useMe } from '@/components/auth/MeProvider';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';

export default function FriendsPage() {
  const { status } = useMe();
  if (status === 'guest')
    return (
      <main className="guest-page">
        <EmptyState
          title="Listen with friends"
          sentence="Sign in to find friends and share songs."
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
      <h1>Friends</h1>
      <p>Your friends will appear here.</p>
    </main>
  );
}
