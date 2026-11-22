'use client';

import Link from 'next/link';
import { useMe } from '@/components/auth/MeProvider';
import { EmptyState } from '@/components/catalogue/CatalogueComponents';

export default function AssistantPage() {
  const { status } = useMe();
  if (status === 'guest')
    return (
      <main className="guest-page">
        <EmptyState
          title="Ask Geet"
          sentence="Sign in to ask about songs on Geet."
          image="/illustrations/no-results.svg"
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
      <h1>Ask Geet</h1>
      <p>Ask Geet about songs in the catalogue.</p>
    </main>
  );
}
