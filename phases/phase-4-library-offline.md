# Phase 4 · Library and offline

**Goal:** make Geet something you use every day: your music, saved on your device.
**Ships:** favourites, playlists, Daily Mix, history, downloads that play in airplane mode, profile and settings.

## Read
Doc 04 (Playlist, Home signed-in sections) · doc 05 (Library, Profile and settings) · doc 06 (Offline listening, Play logging) · doc 13 (library tables, functions, retention) · doc 15 (Library) · doc 19 (contracts)

## Build
- [ ] Favourites (heart everywhere, optimistic with rollback), playlists (create, rename, delete, add, remove, drag reorder, swipe remove), Daily Mix generation (`generate_daily_mix`, `/api/cron/daily-mix`), history and search history, `POST /api/history`.
- [ ] Screens: Library (4 tabs, create menu, sort, view toggle), Playlist page, Home sections "Jump back in", "Made for you", "Artists you like", Profile and settings (every row in doc 05 except Notifications push and Signed-in devices), Upload page upgraded to the full doc 05 design with your-uploads list.
- [ ] Add-to-playlist sheet, track menu (all items that exist so far; Suggest and Jam stay hidden until Phase 5).
- [ ] Offline module honoring `sw.js`: save and remove songs, progress ring, storage meter, `lg_offline` metadata, cover caching, offline banner, offline-aware Library, queued history flush, purge of removed songs (`/api/downloads/check`).
- [ ] Play counts (`tracks.plays`), `popular_tracks`, "Popular this week".
- [ ] Cleanup cron (`/api/cron/cleanup`) with the retention rules, and `/api/cron/keepalive`; Vercel cron entries (one per day) and confirm the GitHub keepalive hits them.
- [ ] Account deletion removes library data.

## Do not build yet
Chat, friends, jams, notifications, assistant, promos, reports, marketing email.

## Acceptance
- [ ] The upgraded upload page skips a byte-identical file already present or in progress and explains that duplicate; ordinary multi-file uploads continue to work.
- [ ] Airplane-mode test: with 3 songs saved, turn on airplane mode, reload the installed app, the offline banner shows, Downloads plays all 3, seeking works.
- [ ] Reordering a playlist survives reload; deleting a playlist keeps the songs.
- [ ] Favourite on one device appears on another within a refresh.
- [ ] Clearing history works; history older than 12 months is removed by the cleanup run (test with a seeded old row).
- [ ] RLS tests extended: another user cannot read or write your playlists or favourites through the API or directly.
- [ ] Settings changes persist and apply (language switches the UI).

## Milestone B: private beta
Use it yourself for a week. Fix what annoys you before Phase 5.

## Your decisions and accounts
- None blocking. Decide how many Daily Mixes (default 3) and the minimum history for them (default 5 favourites or plays).

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-4-library-offline.md` and the docs it lists. Phases 0 to 3 are done. Build Phase 4 only. Run the verify command, then do the airplane-mode test and report. Reply briefly: what changed, verify result, anything blocked.
