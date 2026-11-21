import Link from 'next/link';
import type { ReactNode } from 'react';

/** Branded frame around Clerk's default sign-in and sign-up components. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <section className="auth-brand">
        <img
          src="/brand/geet-wordmark-white.png"
          width={1168}
          height={381}
          alt="Geet"
          className="auth-logo"
        />
        <p className="auth-tagline">
          Music sounds <span>Better Together</span>
        </p>
      </section>
      <section className="auth-form">
        <div className="auth-column">
          {children}
          <p className="auth-legal">
            By continuing you agree to the <Link href="/terms">Terms</Link> and{' '}
            <Link href="/privacy">Privacy</Link>.
          </p>
          <Link href="/" className="auth-guest">
            Keep browsing as a guest
          </Link>
        </div>
      </section>
    </main>
  );
}
