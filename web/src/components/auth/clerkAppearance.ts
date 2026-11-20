import type { ClerkProvider } from '@clerk/nextjs';
import type { ComponentProps } from 'react';

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>['appearance']>;

/**
 * Clerk themed to Geet (docs/05): yellow primary, black inputs, 10 px radius, Inter.
 * "Continue with Google" is the yellow primary button. The email button is the outline secondary.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: '#FFDC00',
    colorPrimaryForeground: '#000000',
    colorForeground: '#FFFFFF',
    colorMutedForeground: '#B3B3B3',
    colorBackground: '#181818',
    colorInput: '#000000',
    colorInputForeground: '#FFFFFF',
    colorDanger: '#FF8A5C',
    colorNeutral: '#FFFFFF',
    colorRing: '#FFDC00',
    borderRadius: '10px',
    fontFamily: 'var(--font-inter), system-ui, sans-serif',
  },
  elements: {
    rootBox: { width: '100%' },
    cardBox: { width: '100%', boxShadow: 'none', border: 'none', background: 'transparent' },
    card: { boxShadow: 'none', border: 'none', background: 'transparent', padding: 0 },
    header: { display: 'none' },
    socialButtonsBlockButton: {
      background: '#FFDC00',
      color: '#000000',
      border: 'none',
      height: '48px',
      fontWeight: 600,
    },
    socialButtonsBlockButtonText: { color: '#000000', fontWeight: 600 },
    dividerLine: { background: '#2A2A2A' },
    dividerText: { color: '#B3B3B3' },
    formButtonPrimary: {
      background: 'transparent',
      color: '#FFFFFF',
      border: '1px solid #3A3A3A',
      height: '48px',
      boxShadow: 'none',
      fontWeight: 600,
    },
    formFieldInput: { height: '48px', border: '1px solid #2A2A2A' },
    footer: { background: 'transparent' },
    footerActionLink: { color: '#FFDC00' },
  },
};
