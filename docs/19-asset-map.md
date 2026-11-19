# 19 · Asset map

What each file you supplied is, where it goes in the web app (`web/public/`), and what it expects from the application.

| File | Is | Used for | Notes |
|---|---|---|---|
| `brand/geet-wordmark-white.png` | Disc mark + "Geet", white, 1168×381 | Desktop sidebar logo | On dark backgrounds |
| `brand/geet-wordmark-white-bars.png` | Five bars + "Geet", white | Phone header on Home, footer, admin header | The bars version is the quieter one |
| `brand/geet-wordmark-black.png`, `-black-bars.png` | Same, black, transparent | Light backgrounds, print | Not used in the dark UI |
| `brand/geet-wordmark-black-on-white.png`, `-black-on-white-bars.png` | Same, black on a white fill | Documents, GitHub README header | |
| `icons/icon-192.png`, `icon-512.png` | Yellow disc with five black bars | PWA icons, tablet rail, sign-in lockup | In the manifest |
| `icons/icon-maskable-512.png` | Yellow full-bleed with bars | Android adaptive icon | Manifest `purpose: maskable` |
| `icons/apple-touch-icon.png` | 180×180 | iOS home screen | Add `<link rel="apple-touch-icon">` |
| `icons/favicon-16/32/48.png`, `favicon.ico`, `favicon.svg` | Favicons | Tab icon | SVG first, ICO fallback |
| `icons/shortcut-search-96.png`, `shortcut-library-96.png`, `shortcut-offline-96.png` | Amber icons on near-black | Manifest shortcuts (Search, Library, Downloads) | Cached by `sw.js` at install |
| `manifest.webmanifest` | PWA manifest (name Geet, black, standalone, 3 shortcuts) | Linked from the document head | Description "Free music with friends." |
| `sw.js` | Service worker | Offline audio with Range support, covers, pages, static assets | Contract in doc 06. Same-origin only |
| `offline.html` | Static offline page | Shown for any page that was not visited while online | Use the recolored copy in `assets-recolored/` (glow removed, see below) |
| `illustrations/*.svg` | offline, no-downloads, no-results, error, cover-fallback | Empty and error states (doc 10) | Use the recolored copies (green to yellow) |
| `og/geet-default.jpg` | 1200×630 share image: disc, "Geet", tagline on navy | Default Open Graph and Twitter image | |
| `audio/signin-prompt.mp3` | 3.9 s spoken or sonic prompt | Played once when a guest's preview ends (doc 06) | Preload lazily; do not autoplay |
| `.well-known/assetlinks.json` | Empty array | Digital Asset Links for a future Android app | Fill in later |
| `geet - Shortcut.lnk` | Windows shortcut | **Not included**: it is a desktop file, not an asset | Dropped from the package |

## Contracts the assets impose on the app
1. **Service worker cache names** `geet-audio-v1`, `geet-covers-v1`, `geet-shell-v4`, `geet-pages-v2`, `geet-data-v1`. The app's offline module (`web/src/lib/offline.ts`) writes to the first two.
2. **Routes the worker watches** (same origin): `/offline-audio/{id}`, `/api/cover/{id}`, `/api/lyrics/{id}`, `/_next/static/*`, `/icons/*`, `/illustrations/*`. Because the real API is on another origin, add Next.js rewrites in `web` for `/api/cover/:id` and `/api/lyrics/:id` to `https://api.listengeet.com/api/...` (use the env value).
3. **Precached files at install:** `/offline.html`, the two white wordmarks (`/brand/geet-wordmark-white.png`, `/brand/geet-wordmark-white-bars.png`), the three icons, three shortcut icons, five illustrations. All must exist or the worker's install fails, so keep every path in the list.
4. **`localStorage.lg_offline`** holds the saved songs' title and artist for the offline page.
5. **Manifest `start_url` `/` and shortcut URLs** `/search`, `/library`, `/library#downloads` must resolve to real screens (doc 02).
6. **Paths** in the manifest are absolute (`/icons/...`): publish `assets/` contents at the web root, not under a subfolder.

## Things to produce later (not in the package)
- Screenshots for the manifest (phone and desktop) once the UI exists.
- A 1200×630 OG template for tracks (generated in code).
- A Play Store feature graphic if the Android app ships.

## Changes made to the supplied files (Phase 0 decisions)
- **`sw.js`:** an offline page navigation serves the stored copy of that exact page if it was visited online, otherwise `/offline.html`. The earlier fallback to the cached home page for any other path is removed. `/brand/*` is cache-first like `/icons/*`, and the two white wordmarks are precached. Shell cache renamed `geet-shell-v4`, so existing installs drop `v3` on activate.
- **Illustrations and `offline.html`:** the soft radial glow behind the artwork is removed from `offline.svg`, `error.svg`, `no-downloads.svg` and `no-results.svg` (doc 01: no glow, no gradients). `cover-fallback.svg` is untouched; its duotone is reworked in Phase 3.
