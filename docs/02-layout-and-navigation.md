# 02 · Layout and navigation

The shell is the frame around every screen: header, navigation, player, footer. Specified per breakpoint.

| Breakpoint | Width | Navigation | Player |
|---|---|---|---|
| Phone | up to 599 px | Top bar + bottom nav (5 tabs) | Mini player above bottom nav, expands to full-screen sheet |
| Tablet | 600 to 1023 px | 80 px left rail | Full-width bar at the bottom, 72 px |
| Desktop | 1024 px and up | 280 px sidebar, optional 340 px right panel (from 1280 px) | Full-width bar at the bottom, 88 px |

Content max width inside the main column: 1200 px, left aligned, never centered with empty margins on both sides.

---

## 1. Phone shell

```
┌──────────────────────────────┐ 56  top bar
│ [Geet bars+word]      🔔  (A) │
├──────────────────────────────┤
│                              │
│   scrolling content          │
│                              │
├──────────────────────────────┤ 64  mini player (when something is queued)
│ [cover] Title        ♡  ▶    │
├──────────────────────────────┤ 56 + safe area  bottom nav
│  Home  Search Library Friends Ask │
└──────────────────────────────┘
```

### Top bar (56 px, sticky, solid black)
| Element | Spec |
|---|---|
| Left, Home tab | `geet-wordmark-white-bars.png`, 20 px high. Tapping scrolls to top |
| Left, other tabs | Page title in H1-small (Outfit 700, 22 px). Large title collapses to 18 px centered on scroll for detail pages |
| Left, detail pages | Back button: chevron-left, 44 px target |
| Right, signed in | **Bell** (notifications, opens the notifications sheet; yellow 8 px dot when unread) and **avatar** 32 px (Clerk image, or initials on `plum`). Avatar opens the account menu |
| Right, guest | Text button "Sign in" (white, 14/600) and small yellow pill "Sign up" (36 px high) |
| Bottom edge | 1 px `line`, appears only after the page has scrolled |
| Offline | A 28 px coral strip under the bar: "You're offline. Saved songs still play." |

**Account menu** (bottom sheet on phone, popover on desktop). Rows with icons: Profile (user), Upload a song (upload-simple; shown if allowed), Settings (gear), Language (translate) with current value at right, Admin (shield; admins only), About Geet, Sign out (text in `danger`). Header of the sheet: avatar 48, display name, @username.

### Mini player (64 px)
Appears once any song is queued. Hidden on the full player and when nothing has played.
- Solid `surface`, 1 px `line` top edge, a **2 px yellow progress line** along the very top edge showing elapsed.
- Left: cover 48 (6 px), then title (Inter 600 14, one line, marquee if clipped) over artist (13, `text-2`).
- Right: heart (favourite, 44 target), play/pause (white circle 40 with black glyph).
- Tap anywhere else: opens the full player (doc 06). Swipe left/right on the bar: next/previous. Swipe up: opens full player.
- Guest: a tiny lock-free label "Preview" in `text-3` replaces the artist suffix: `Artist · Preview`.
- **Jam strip:** when in a jam, a 36 px yellow strip sits directly on top of the mini player: `In Hardeep's jam · 3 listening` (black, 13/600) and a chevron. Tap opens the jam room.

### Bottom nav (56 px + `env(safe-area-inset-bottom)`)
Five equal tabs. Icon 24 px, label 10 px Inter 600 below.

| Tab | Icon (inactive → active) | Goes to | Badge |
|---|---|---|---|
| Home | house → house fill | `/` | none |
| Search | magnifying-glass → fill (thick) | `/search` | none |
| Library | books → books fill | `/library` | none |
| Friends | users → users fill | `/friends` | yellow count: unread messages plus pending requests |
| Ask | Ask Geet glyph (bars in a bubble) outline → filled | `/assistant` | none |

- Active: filled icon, white label, **3×16 px yellow pill above the icon**. Inactive: `text-2` icon and label.
- Tapping the active tab scrolls to top; tapping it again returns that tab to its root.
- Bottom nav is hidden while the keyboard is open and inside the full player, jam room and a chat thread.
- **Guests** still see all five tabs. Library, Friends and Ask open a gate screen (see doc 05, Sign in) rather than being hidden, so people see what they get by signing in.

### Page padding
Bottom padding of every scrolling page = 56 + safe area + (64 if mini player) + (36 if jam strip) + 16.

---

## 2. Tablet shell (600 to 1023 px)
- **Left rail, 80 px:** top: yellow disc icon 40 px (tap = Home). Items stacked, icon 24 with label 11 below, same set as phone nav in the same order. Bottom of rail: avatar 40 (or "Sign in" key icon for guests).
- **No top bar.** Page title is in content. A search field is in the page header on Search only.
- **Player bar 72 px** full width at the bottom (desktop bar, condensed: no volume, no lyrics icon).
- Content gutter 24 px, track lists show cover + title + artist + duration.

---

## 3. Desktop shell (1024 px and up)

```
┌───────────┬──────────────────────────────────────┬────────────┐
│ Sidebar   │ Header (64): ‹ ›  [ search ]   ⬇ 🔔 (A) │ Right panel│
│ 280       ├──────────────────────────────────────┤ 340        │
│           │  Main content, scrolls               │ (≥1280)    │
│           │                                      │            │
├───────────┴──────────────────────────────────────┴────────────┤
│ Player bar 88                                                  │
└────────────────────────────────────────────────────────────────┘
```
Columns separated by 1 px `line` hairlines. **No rounded panels, no gaps, no different grays between columns**: the whole app is one black canvas with lines. This is deliberate (see doc 01).

### Sidebar (280 px)
Top to bottom:

1. **Logo:** `geet-wordmark-white.png`, 30 px high, 24 px from top and left. Links to `/`.
2. **Primary nav**, rows 44 px, icon 24 + label Inter 600 15:
   - Home, Search. Active row: filled icon, white text, 3 px yellow bar on the row's left edge.
3. **Section "Your library"** (label caption style) with a **+** icon button at right (opens the create menu: Create playlist, Upload a song) and a **view toggle** (list/compact).
   - Filter chips: Playlists, Favourites, Downloads (single select, tap again to clear).
   - Pinned rows (56 px, cover tile 40 px square, 6 px radius):
     - **Favourites:** tile is `accent` with a black filled heart. Subtitle "Playlist · N songs".
     - **Downloads:** tile is `raised` with a yellow arrow-down. Subtitle "N songs on this device".
     - **Daily Mix 1, 2, 3:** collage tile with a yellow number. Subtitle "Updated today".
   - User playlists: collage or first cover tile, name, "Playlist · N songs".
   - Currently playing source shows a mini equalizer (yellow) in place of the subtitle dot.
   - List scrolls independently.
4. **Section "Together"**: Friends (badge), Messages (badge), Jams. Jams opens a small page listing "Start a jam" and "Join with a code".
5. **Ask Geet** row with the bars-in-bubble glyph.
6. **Bottom block** (sticky): **Install app** outline pill (only when the browser reports the app is installable; hides after install), then small muted links in one wrapped line: Terms · Privacy · Copyright · GitHub, then `© 2026 Geet`.

Collapsed state (below 1280 px or user toggle): sidebar shrinks to the 80 px rail from the tablet layout; the library list is replaced by a Library icon.

### Header (64 px, sticky)
- Transparent over the page, solid black with a 1 px line once scrolled.
- Left: **Back** and **Forward** circle buttons (36 px, `surface` fill, chevrons). Disabled state when no history.
- Search field (right after the buttons): 44 px high pill, `surface` fill, magnifying-glass at left, placeholder "Songs, artists", a `/` keycap hint at right (hidden once focused). Typing navigates to `/search?q=` live and keeps focus. `Esc` clears. A clear (x) button appears when non-empty.
- Right, signed in: **Install app** (shown only if installable and not in sidebar), **Bell**, **avatar** 36 px with the account menu popover.
- Right, guest: "Sign up" text button and "Log in" yellow pill 40 px.

### Right panel (340 px, 1280 px and up, toggled from the player bar)
Tabs at the top as underline tabs: **Now playing**, **Queue**, **Friends**; plus **Jam** (first tab) while in a jam. Remembers last tab.
- **Now playing:** cover 308, title (Outfit 700 22), artist link, heart, then "More from {artist}" (3 rows) and a lyrics preview (6 lines, "Open lyrics" link).
- **Queue:** same as the queue sheet (doc 06).
- **Friends:** list of friends currently listening: avatar, name, "Song · Artist". Tap = friend sheet (Listen to this, Message). Empty: "Nobody's listening right now."
- Close button (x) top right; panel state saved per device.

### Player bar (88 px)
Three columns (30 / 40 / 30 %), `surface` fill, 1 px `line` top.

| Column | Contents |
|---|---|
| Left | Cover 56 (click opens full player), title (Inter 600 14) and artist (13 `text-2`, both links), heart, add-to-playlist (plus-circle) |
| Center | Row: shuffle, previous, **play/pause (white circle 40)**, next, repeat. Under it: elapsed `0:42`, slim scrubber (4 px line, `line-strong` track, yellow fill, 12 px thumb on hover, max width 560), total `3:51` |
| Right | Lyrics (microphone-stage), Queue (queue), Jam (users-three; yellow when in a jam), Download (arrow-circle-down; filled yellow when saved), volume (speaker icon + 100 px slider; click icon to mute), Expand (arrows-out) |

Guest: scrubber ends at a "0:40" marker with a lock icon; hovering shows "Sign in to hear the full song".

### Keyboard shortcuts (desktop)
`Space` play/pause · `←` `→` seek 5 s · `Shift+←` `Shift+→` previous / next · `↑` `↓` volume · `M` mute · `L` favourite · `/` focus search · `Q` queue panel · `?` open the shortcuts list (a small dialog). Disabled while typing in a field.

---

## 4. Footer

A real footer, but quiet. Shown at the **bottom of the Home page content** (all breakpoints), at the bottom of Profile on phones, and on the public legal and track pages. Not repeated on every screen (the sidebar carries the compact legal line on desktop).

Layout (desktop: four columns; phone: stacked, 24 px gaps, 1 px line on top, 48 px top padding):

| Column | Content |
|---|---|
| Brand | `geet-wordmark-white-bars.png` 22 px high. Under it: "Music sounds better together." with "Better Together" in yellow. Nothing else |
| Listen | Home, Search, Install the app (hidden if not installable), Upload a song (if allowed) |
| Help | Report a song (explains the Report button), Copyright and takedowns, Contact (mailto), Status (link to the GitHub Pages or Vercel status page if one exists, otherwise omitted) |
| Legal and open source | Terms, Privacy, Open source (GitHub repo), Licence |

Bottom row, hairline above: `© 2026 Geet` at left; **language switcher** at right as three text buttons `English · ਪੰਜਾਬੀ · हिन्दी` (current one white, others `text-2`). No social icons, no newsletter box, no "made with love".

Footer text: Meta size, `text-2`; links underline on hover only.

---

## 5. Routes

| Route | Screen | Auth |
|---|---|---|
| `/` | Home | public |
| `/search` | Search | public |
| `/library` | Library (`#downloads` opens Downloads tab) | gate for guests (Downloads still works offline) |
| `/playlists/[id]` | Playlist | owner, or Daily Mix owner |
| `/artist/[name]` | Artist | public |
| `/t/[id]` | Track share page | public |
| `/friends`, `/friends/requests` | Friends | gate |
| `/u/[username]` | Public profile and add-friend | public view, add needs sign in |
| `/chat`, `/chat/[id]` | Messages | gate |
| `/jam`, `/jam/[id]`, `/j/[code]` | Jam hub, room, join link | gate |
| `/assistant` | Ask Geet | gate |
| `/upload` | Upload | by `UPLOAD_MODE` |
| `/profile`, `/settings` | Profile and settings (same page, two sections) | gate |
| `/onboarding` | First-run setup | signed in, once |
| `/sign-in`, `/sign-up` | Clerk | public |
| `/admin/*` | Admin | admin role |
| `/terms`, `/privacy`, `/copyright` | Legal | public |
| `/email/unsubscribe` | Unsubscribe from Geet news (doc 20) | public, token |
| `/offline.html` | Offline fallback | static |
