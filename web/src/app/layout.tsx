import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { clerkAppearance } from '@/components/auth/clerkAppearance';
import { MeProvider } from '@/components/auth/MeProvider';
import { OnboardingGuard } from '@/components/auth/OnboardingGuard';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import { isDevSite } from '@/lib/site';
import { inter, notoDevanagari, notoGurmukhi, outfit } from './fonts';
import '../styles/globals.css';

const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const dev = isDevSite(appUrl);

export const metadata: Metadata = {
  metadataBase: appUrl ? new URL(appUrl) : undefined,
  title: 'Geet',
  description: 'Free music with friends.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Geet',
    description: 'Free music with friends.',
    siteName: 'Geet',
    images: [{ url: '/og/geet-default.jpg', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: ['/og/geet-default.jpg'] },
  robots: dev ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const fonts = [outfit, inter, notoGurmukhi, notoDevanagari].map((f) => f.variable).join(' ');
  return (
    <html lang="en" className={fonts}>
      <body>
        {dev ? <div className="env-bar" role="presentation" data-testid="dev-bar" /> : null}
        <ClerkProvider
          appearance={clerkAppearance}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpForceRedirectUrl="/onboarding"
          localization={{ formButtonPrimary: 'Email me a code' }}
        >
          <MeProvider>
            <OnboardingGuard />
            {children}
          </MeProvider>
        </ClerkProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
