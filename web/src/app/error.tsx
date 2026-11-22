'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[web] page error', error.digest ?? 'unknown');
  }, [error.digest]);
  return (
    <main className="error-page">
      <Image src="/illustrations/error.svg" alt="" width={240} height={200} unoptimized />
      <h1>Couldn't load this</h1>
      <p>Check your connection and try again.</p>
      <button className="btn btn-secondary" onClick={reset}>
        Try again
      </button>
      <Link href="/">Go to Home</Link>
    </main>
  );
}
