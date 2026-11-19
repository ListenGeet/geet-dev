import type { ReactNode } from 'react';

// API only. This layout exists because Next.js requires a root layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
