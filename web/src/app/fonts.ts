import localFont from 'next/font/local';

// Self-hosted (docs/01): no Google requests at runtime, so the service worker can cache them.
export const outfit = localFont({
  src: '../fonts/Outfit-latin.woff2',
  weight: '100 900',
  variable: '--font-outfit',
  display: 'swap',
});

export const inter = localFont({
  src: '../fonts/Inter-latin.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});

// Indic scripts are used automatically through the font stack when text contains them.
// Not preloaded: they load only when needed (docs/18).
export const notoGurmukhi = localFont({
  src: '../fonts/NotoSansGurmukhi.woff2',
  weight: '100 900',
  variable: '--font-gurmukhi',
  display: 'swap',
  preload: false,
});

export const notoDevanagari = localFont({
  src: '../fonts/NotoSansDevanagari.woff2',
  weight: '100 900',
  variable: '--font-devanagari',
  display: 'swap',
  preload: false,
});
