# 06 · Player, queue, lyrics, offline, guest preview

## Engine
- One HTML audio element owned by a single player store; every surface (mini player, bar, full player, jam room) reads and controls the same store.
- Source per track: signed URL from `GET /api/tracks/{id}/play`. Signed-in users get `full.m4a`; guests get `preview.m4a`. Signed URLs expire (audio 2 h), so the player requests a fresh URL when the old one is within 5 minutes of expiry or on a 403.
- **Preloading:** when 20 s remain, request the next track's URL and set `preload="auto"` on a second hidden audio element for gapless-ish transitions.
- **Media Session API:** title, artist, cover (96/320/600), play, pause, previous, next, seek; so lock screen and headphone buttons work.
- **Background play on phones:** works while the screen is off if the PWA is installed or the tab stays alive; nothing special beyond Media Session.
- **Play logging:** when a track ends, is skipped, or leaves after 30 s, send `POST /api/history` with `outcome` (`completed`, `skipped`, `partial`) and `listened_ms`. Used for Daily Mix and "Popular this week".
- **Errors:** a failed load retries once with a fresh URL, then skips with a toast "Couldn't play {title}. Skipped."
- **Buffering:** if stalled over 800 ms, the play button shows the 24 px equalizer instead of the triangle.

## Full player (phone: full-screen sheet; desktop: overlay from the bar's Expand button)
Layout top to bottom (390 px wide design):

1. **Top row** (56): chevron-down (closes), center two-line label: caption "Playing from" and the source name (playlist, "Search", artist, "Jam"), right ⋯ (player menu).
2. **Cover:** square, `min(100% - 48px, 420px)`, 6 px radius, centered. Swipe left/right on the cover = next/previous.
3. **Title block:** title (Outfit 700 24, marquee if clipped), artist (16, `text-2`, link). At the right, the heart (28 px glyph).
4. **Bar scrubber:** 64 pill bars (3 px wide, 3 px gap, scaled to width), height from the track's real waveform peaks (20 % to 100 % of 40 px). Played bars `accent`, unplayed `line-strong`. Drag or tap to seek; while dragging, a time bubble shows above. Under it: elapsed (left) and remaining with a minus (right), tabular, 12 px `text-2`. If a track has no stored waveform, bars come from a hash of the track id (flat-ish, clearly not real) and an `aria-hidden` note.
5. **Transport:** shuffle · previous · **play/pause (white circle 72)** · next · repeat. Shuffle and repeat are yellow when on; repeat cycles off → all → one (shows a small "1").
6. **Action row** (five equal icon buttons, 44 targets): Download · Lyrics · Jam · Queue · Share.
   - **Download:** states: arrow-circle-down (idle), ring (progress), filled yellow (saved). Guests: gate.
   - **Lyrics:** opens the lyrics view (below). Hidden if the track has none.
   - **Jam:** if not in a jam: starts one with this song (confirm sheet explaining invites). In a jam: opens the room.
   - **Queue:** opens the queue sheet.
   - **Share:** sheet with **Send to a friend**, **Copy link**, and (where the browser supports it) the system share sheet. The link is `/t/{id}`.
7. Safe area padding at the bottom.

**Player menu (⋯):** Add to playlist · Go to artist · Suggest to a friend · Start a jam with this song · **Sleep timer** · Report this song · Copy link.
**Sleep timer** sheet: Off, 15 min, 30 min, 45 min, 60 min, End of this song. While active, a small moon icon with the remaining time sits next to the action row.

Desktop overlay: same content in two columns (cover left 420, controls and lyrics right), dismissed with `Esc` or the chevron.

## Lyrics view
- Opens as the same sheet scrolled to a lyrics panel (phone) or replaces the right column (desktop).
- **Synced lyrics** (when `.lrc` timestamps exist): current line white Outfit 700 22, others `text-3` at 20; auto-scrolls to center the current line; **tap a line to seek**; user scrolling pauses auto-scroll for 4 s.
- **Plain lyrics:** static text, Inter 18/28, no sync.
- Scripts render in their own font (Gurmukhi, Devanagari) with the Indic type rules from doc 01.
- Footer line: "Lyrics added by the uploader." (`text-3`). Lyrics are cached for offline (service worker `geet-data-v1`).
- Missing lyrics: the Lyrics button is hidden; the panel never shows "No lyrics" on playback.

## Queue
Sheet (phone), right panel tab (desktop).
- **Now playing** row (yellow title, equalizer).
- **Next in queue:** rows with drag handles; swipe left removes; header text button **Clear queue** (keeps the current song).
- **Next from {source}:** the remainder of the playlist or list that started playback, in a muted label. Adding "Play next" inserts at the top of "Next in queue".
- Shuffle reorders the remaining "Next from" list only; turning it off restores the original order.
- Queue persists across reloads (local storage: ids, index, position) but never resumes playing by itself.

## Guest 40-second preview
- Guests get `preview.m4a` (first 40 s, 2 s fade-out, created at transcode, see doc 14). The player enforces the limit as well, in case a full URL is ever obtained.
- At 0:35 the scrubber's last bars pulse and the label "Preview ends" shows; at 0:40 playback stops, the sign-in gate sheet opens and `signin-prompt.mp3` plays once.
- After dismissing, tapping Play restarts the preview; the sheet reopens at the end again but the audio prompt only plays once per session.
- Guests cannot: favourite, download, build playlists, use jams, chat or the assistant, skip past the preview end, or use the queue beyond the session. They can search, browse, play previews, open share links, and report songs.
- Guest play counts toward `plays` totals but not `play_history` (no account).

## Offline listening
**Contract with the provided service worker `assets/sw.js`:**
| Item | Value |
|---|---|
| Audio cache | `geet-audio-v1`; key `/offline-audio/{trackId}` stores the full m4a. The worker serves it with HTTP Range support, MIME `audio/mp4` |
| Cover cache | `geet-covers-v1`; key `/api/cover/{trackId}` |
| App shell | `geet-shell-v3`; pages `geet-pages-v2`; lyrics `geet-data-v1` |
| Metadata for the offline page | `localStorage.lg_offline` = JSON `{ "<trackId>": { "title": "...", "artist": "..." } }`, read by `offline.html` |
| Offline playback URL | `<audio src="/offline-audio/{trackId}">` when the id is saved and the device is offline (or always, when saved, to save data) |

**Same-origin requirement:** the service worker ignores other origins. Because the API lives at `api.listengeet.com`, the web app must **rewrite** `/api/cover/*` and `/api/lyrics/*` to the API so the browser sees them as same-origin (a `rewrites()` entry in the web app's Next config). All other API calls go cross-origin with a bearer token and do not need the worker.

**Saving a song:** fetch a fresh signed full-audio URL, download with progress, store in `geet-audio-v1`, store the cover in `geet-covers-v1`, write `lg_offline`. Show the progress ring. Saved size is added to the Downloads meter.
- **Rights:** only signed-in users can download. Downloads are tied to the account: signing out or deleting the account clears the audio cache.
- **Quota:** if the browser denies space, toast "Not enough space on this device." Never silently fail.
- **Auto-clean:** a song removed by admin takedown is purged from a device the next time the app is online (the library check compares saved ids with the catalogue).
- **Offline UX:** offline banner, bottom nav stays, Home shows "Your downloads" as the only content, Search says it needs a connection. The player continues from cache. Play history is queued locally and sent when back online.
- **iOS caveat:** Safari may evict caches for sites not used for several weeks, and a home-screen PWA gets more storage than a tab. Note this in Settings > Downloads help text.

## Remote control and multiple devices
`devices` table keeps registered devices and presence (name, type, last seen). Used for push tokens and, later, remote play. Remote play is not in v1; do not build UI for it.
