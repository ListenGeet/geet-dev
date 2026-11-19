# Phase 3 · App shell, player, catalogue

**Goal:** the product people see. Every breakpoint's frame, the player, and the public catalogue screens.
**Ships:** on a phone, a guest can find a song, hear a 40 s preview and meet the sign-in sheet; a signed-in user hears the full song.

## Read
Docs 01, 02, 03 (all) · doc 04 (Home, Search, Artist, Track share page, Public profile, Legal) · doc 06 (Engine, Full player, Lyrics, Queue, Guest preview) · doc 10 · doc 11 (strings)

## Build
- [ ] Shell: phone (top bar, mini player, 5-tab bottom nav with active bar), tablet rail, desktop sidebar, header, right panel, 88 px player bar, footer. Guest gate screens for Library, Friends, Ask tabs.
- [ ] Player store and audio engine, preloading, Media Session, play logging stub, error and buffering handling.
- [ ] Full player with the **bar scrubber from real waveform**, transport, action row (Download, Jam, Share buttons present but gated or disabled until their phases), player menu, sleep timer, queue sheet, lyrics view (synced and plain).
- [ ] Guest preview rules and the sign-in gate sheet with `signin-prompt.mp3`.
- [ ] Screens: Home (all sections that need no account data; promos area reserved, Phase 6 fills it), Search (browse tiles, results, states), Artist, Track share page with Open Graph image, Public profile (add-friend button disabled until Phase 5), legal pages (draft text), 404, error boundary.
- [ ] Components from doc 03 and every loading, empty and error state in doc 10.
- [ ] Search endpoint and trigram index tuned; `/api/home`, `/api/search`, `/api/artists`, `/api/browse/*`, lyrics endpoint, `rewrites` for `/api/cover/*` and `/api/lyrics/*`.
- [ ] Language switcher with the three UI languages (doc 11), `lang` attributes.
- [ ] Keyboard shortcuts (desktop).

## Do not build yet
Favourites, playlists, downloads, history, chat, jams, assistant, admin, promos editing.

## Acceptance (test on a real phone and a desktop)
- [ ] 390 px: top bar, mini player, bottom nav match doc 02; no horizontal scroll; Lighthouse performance 85+ on Home.
- [ ] A guest hears a preview that stops at 0:40; the sheet opens and the prompt plays once; Play restarts the preview.
- [ ] Search finds songs by title, artist, and Latin-letter spelling of a Punjabi title; no-results state shows its illustration.
- [ ] Lock-screen controls work (Media Session). Seeking by tapping the bars works. Synced lyrics follow playback.
- [ ] The shared link `/t/{id}` shows a correct preview image in a chat app.
- [ ] Doc 01 slop table: no gradients except promo scrim, no emoji icons, one yellow primary per screen.

## Your decisions and accounts
- Upload 12 to 20 real songs you have rights to (or seed tones) with covers and some lyrics so the screens have real content.
- Review the Punjabi and Hindi strings with a native speaker.

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-3-shell-player-catalogue.md` and the docs it lists. Phases 0 to 2 are done. Build Phase 3 only. Run the verify command, then test the guest preview flow in a 390 px viewport and report. Reply briefly: what changed, verify result, anything blocked.
