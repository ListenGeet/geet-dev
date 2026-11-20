import type { ClerkProvider } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: 'var(--accent)',
    colorPrimaryForeground: 'var(--on-accent)',
    colorBackground: 'var(--midnight)',
    colorForeground: 'var(--text)',
    colorInput: 'var(--bg)',
    colorInputForeground: 'var(--text)',
    colorMutedForeground: 'var(--text-2)',
    colorRing: 'var(--accent)',
    borderRadius: '10px',
    fontFamily: 'var(--font-body), system-ui, sans-serif',
  },
  elements: {
    card: { backgroundColor: 'var(--midnight)', boxShadow: 'none' },
    dividerLine: { backgroundColor: 'var(--line)' },
    dividerText: { color: 'var(--text-2)' },
    formFieldInput: {
      border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius-input)',
    },
    formButtonPrimary: {
      backgroundColor: 'var(--accent)',
      borderRadius: 'var(--radius-pill)',
      boxShadow: 'none',
      color: 'var(--on-accent)',
      fontWeight: 600,
    },
    footer: { backgroundColor: 'transparent' },
    footerActionLink: { color: 'var(--accent)' },
  },
};
