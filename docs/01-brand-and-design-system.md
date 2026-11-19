# 01 · Brand and design system

## What the brand actually is
Taken from your assets, not invented:

- **Mark:** a yellow disc (`#FFDC00`) holding five black vertical pill bars (short, medium, tall, medium, short), like a waveform.
- **Wordmark:** "Geet" in a heavy geometric sans. Six files in `assets/brand/`: white or black, each with the disc ("on-white", plain) or with bare bars instead of a disc ("-bars").
- **OG image:** deep navy background (`#0B1226` area), yellow disc, white "Geet", yellow underline, tagline *Music Sounds **Better Together*** with "Better Together" in yellow.
- **Tone of your UI files:** pure black background, `#181818` surfaces, `#2A2A2A` borders, `#B3B3B3` secondary text.

### One conflict to fix
Your illustrations, offline page and old manifest use **green `#1ED760`**, which is Spotify's color and clashes with your yellow logo. The spec makes **yellow the only accent**. `assets-recolored/` has green swapped for yellow (`#FFDC00`, `#FFE94D`, `#FFF0A0`). Use those.

## Why this will not look like AI slop
These are rules, not mood. Review every screen against them.

| Slop pattern | Geet instead |
|---|---|
| Purple-blue gradients, glow blobs, glassmorphism | Flat black. No gradients except one functional scrim under text on promo images. No blur |
| Everything in rounded cards with soft shadows | Content sits on the page with hairline dividers. Cards only where a thing is a card (promo, jam invite, track in chat). No card inside a card |
| Same 16 px radius everywhere | Three shapes only: pills (controls), 6 px (covers), circles (artists, avatars). Sheets 20 px on top corners |
| Generic hero with three feature tiles | There is no marketing hero. The home page is the catalogue |
| Emoji as icons, sparkle icon for AI | One icon family (Phosphor), plus the brand's own bars. AI gets a bars-in-a-bubble glyph, not sparkles |
| Stock photography, 3D blobs, mascot | Only real cover art and your five illustrations |
| "Welcome back! 👋", "Oops!", "Unleash", "Seamless" | Plain, warm, short sentences. See doc 11 |
| Rainbow category tiles | Language and genre tiles use two or three muted brand tints, large script text, no photos |
| Identical spacing and weight on everything | Strong hierarchy: one big thing per screen, quiet everything else |
| Fake stats, testimonials, "10M songs" | Never. Numbers shown are real or absent |
| Pure white text on pure black everywhere | White for titles, `#B3B3B3` for meta, `#6B6B6B` for disabled |

### The one rule for yellow
**Yellow means "do this" or "this is on".** Primary button, the active tab bar, a filled heart, the played part of the scrubber, the playing track's title, an unread badge, your own chat bubble. At most one primary yellow button per screen. If everything is yellow, nothing is.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `bg` | `#000000` | App background (matches manifest) |
| `surface` | `#181818` | Inputs, mini player, sheets, chips |
| `raised` | `#242424` | Hover rows, menus, other people's chat bubbles |
| `line` | `#2A2A2A` | Hairlines, borders |
| `line-strong` | `#3A3A3A` | Unplayed scrubber bars, focus rings on dark |
| `text` | `#FFFFFF` | Titles, body |
| `text-2` | `#B3B3B3` | Meta, secondary |
| `text-3` | `#6B6B6B` | Disabled, inactive lyric lines |
| `accent` | `#FFDC00` | See rule above |
| `accent-press` | `#E6C600` | Pressed |
| `accent-soft` | `#FFE94D` | Hover on dark, illustration highlights |
| `accent-tint` | `rgba(255,220,0,.14)` | Selected row background, chip selected |
| `on-accent` | `#000000` | Text/icons on yellow |
| `midnight` | `#0B1226` | Sign-in page, jam room, guest strip. From the OG image. Used in only these three places |
| `plum` | `#3B2F4A` / `#150F1D` | Cover fallback only (from `cover-fallback.svg`) |
| `danger` | `#FF8A5C` | Errors, destructive actions, offline slash (from your illustrations) |

Contrast: yellow on black and black on yellow both exceed 14:1. `text-2` on black is 9.6:1. `text-3` is for disabled only and may fail AA by design.

No green anywhere, including success. Success is a yellow check.

## Typography

| Role | Font | Notes |
|---|---|---|
| Display and titles | **Outfit** 700/800 | Closest free match to the wordmark's geometry. Page titles, big numbers, artist names |
| Body and UI | **Inter** 400/500/600 | Your OG tagline is Inter. Tabular numbers for time |
| Punjabi (Gurmukhi) | **Noto Sans Gurmukhi** | Used automatically when text contains Gurmukhi |
| Hindi (Devanagari) | **Noto Sans Devanagari** | Same |

Self-host through `next/font` (no Google requests at runtime, works offline via service worker). Indic text: line-height +0.1, **no negative letter-spacing**, never uppercase.

| Style | Size / line (mobile → desktop) | Font, weight |
|---|---|---|
| Display | 32/38 → 48/54 | Outfit 800, tracking -0.02em |
| H1 | 26/32 → 36/42 | Outfit 700 |
| H2 | 20/26 → 24/30 | Outfit 700 |
| Row title | 15/20 | Inter 600 |
| Body | 15/22 | Inter 400 |
| Meta | 13/18 | Inter 400, `text-2` |
| Caption / kicker | 11/14 | Inter 600, uppercase (Latin only), tracking +0.06em |

## Spacing, shape, elevation
- 4 px base grid. Page gutter 16 px mobile, 24 px tablet, 32 px desktop.
- Touch targets at least 44×44 px, including icon-only buttons (visual icon 24 px).
- Radius: pill `999px`; cover `6px`; input `10px`; sheet top `20px`; menu `10px`.
- No shadows, except popovers and menus: `0 8px 24px rgba(0,0,0,.6)` plus 1 px `line` border.
- Dividers: 1 px `line`, inset 16 px on lists.

## Iconography
- **Phosphor Icons**, regular weight 24 px, 1.5 px stroke feel. **Fill weight for the active/on state** (house filled when on Home, heart filled when favourited).
- Brand glyphs, drawn from the logo's bars: the **equalizer** (5 bars), the **Ask Geet glyph** (5 small bars inside a speech bubble outline), the **active-tab bar** (a 3×16 px yellow pill above the icon).
- No emoji in UI chrome. User-written chat text may contain emoji.

## Signature elements (what makes it recognisable)
1. **Equalizer bars.** Five pill bars, 3 px wide, staggered animation 900 ms loop. Used for: now-playing indicator in lists, buffering, loading, empty states, "typing…", the Ask Geet thinking state, the pull-to-refresh.
2. **Bar scrubber.** The full player and jam room scrubber is a row of pill bars (the logo's shape) whose heights are the song's real waveform (64 peaks computed at transcode, stored on the track). Played bars yellow, unplayed `line-strong`. Mini player and desktop bar use a slim line instead, to stay quiet.
3. **Active tab bar.** A yellow 3 px pill above the active nav icon, echoing the logo's bars.
4. **Language in its own script.** Language chips and tiles show ਪੰਜਾਬੀ, हिन्दी, English in their scripts at large size. This is Geet's face.
5. **Cover fallback.** When a song has no art, use `cover-fallback.svg` recolored to one of 8 plum/midnight duotones chosen by hashing the title, so a library of uncovered songs does not look like one repeated tile.
6. **Yellow highlight word.** In the few places the tagline appears, only "Better Together" is yellow, as in the OG image.

## Motion
- State changes 120 ms ease-out. Press: scale 0.98, 90 ms.
- Sheets: 240 ms `cubic-bezier(.2,.8,.2,1)`. Mini → full player expands the cover from its mini position (shared-element), 280 ms.
- Page transitions: none (instant). Fast feels better than fancy.
- `prefers-reduced-motion`: equalizer freezes at mid height, sheets fade 120 ms, no shared-element.
- No parallax, no confetti, no auto-playing animation that loops outside the equalizer.

## Imagery
- Covers: square, 6 px radius. Sizes served at 48, 96, 160, 320, 600 px (generated from the 600 px cover; see doc 14).
- Artist image: there is no artist table. Show a circle using the cover of the artist's most-played song.
- Promo images: 16:7 on phone, 21:6 on desktop, uploaded by admin, text overlaid with a bottom scrim.
- Illustrations: your five SVGs, recolored, one per state (doc 10). Never anything decorative.

## Theming
Dark only in v1. `theme-color` and `background_color` stay `#000000` as in the manifest. No light theme, no auto theme: one polished theme beats two thin ones.

## Logo usage
| Place | File | Size |
|---|---|---|
| Desktop sidebar top | `brand/geet-wordmark-white.png` (disc + Geet) | 30 px high |
| Phone header on Home | `brand/geet-wordmark-white-bars.png` (bars + Geet) | 20 px high |
| Tablet rail top | `icons/icon-192.png` (yellow disc) | 40 px |
| Sign-in page | OG-style lockup: `icon-512.png` 72 px + "Geet" wordmark white 40 px | |
| Footer | `brand/geet-wordmark-white-bars.png` | 22 px high |
| Admin header | `brand/geet-wordmark-white-bars.png` + "Admin" in Outfit 700 | |
| Favicon | `favicon.svg`, `favicon.ico`, `favicon-16/32/48.png` | |
| Never | Recolor, stretch, put on yellow without the black variant, add effects | |

Clear space around the wordmark: at least the height of the "e" on all sides. Minimum size 20 px high.
