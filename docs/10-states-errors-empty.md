# 10 · States: loading, empty, error, offline

Illustration map (all in `assets-recolored/illustrations/`, shown 240 px wide on phone, 320 on desktop):

| File | When |
|---|---|
| `offline.svg` | No connection |
| `no-downloads.svg` | Nothing saved offline; empty catalogue; gate screen for Library |
| `no-results.svg` | Search with no results |
| `error.svg` | Something failed, server error |
| `cover-fallback.svg` | A song or playlist has no cover (used as image, see doc 01 for duotones) |

For states without an illustration (empty playlist, empty notifications, empty queue) use the 48 px equalizer with text only.

## Loading
- Every list: skeleton rows matching the real layout (cover block, two bars). 6 rows minimum.
- Cards rows: skeleton cards.
- Never a full-screen spinner. Never a blank screen for more than 300 ms.
- Player buffering: equalizer replaces the play glyph.
- Buttons that wait: label replaced by the equalizer, width locked.

## Empty states (title, sentence, button)
| Screen | Title | Sentence | Button |
|---|---|---|---|
| Home, empty catalogue | Nothing here yet | Songs will appear here soon. | (admin) Upload the first song |
| Search, no results | No songs for “{query}” | Check the spelling, or search the artist's name. | Ask Geet to find it |
| Library, Favourites | No favourites yet | Tap the heart on a song to keep it here. | Find songs |
| Library, Playlists | No playlists yet | Make one for the drive, the gym, or no reason at all. | Create playlist |
| Library, Downloads | Nothing saved for offline yet | Tap the arrow on any song to keep it on this device. | Find songs |
| Library, History | Nothing played yet | Songs you play will show up here. | Go to Home |
| Playlist, empty | This playlist is empty | Add a few songs to get started. | Add songs |
| Queue, empty | The queue is empty | Play a song and what's next will show here. | (none) |
| Friends | No friends yet | Add someone by their username, or share your link. | Add friend |
| Requests | No requests right now | | |
| Messages | No messages yet | Say hello to a friend. | Find a friend |
| Notifications | You're all caught up | | |
| Jam hub | No jam going | Start one and invite a friend. | Start a jam |
| Assistant | (starter prompts, no empty message) | | |
| Admin, no open reports | No open reports | | |

## Errors
| Case | Display | Action |
|---|---|---|
| A list or page fails to load | `error.svg`, "Couldn't load this", "Check your connection and try again." | **Try again** |
| Action failed (favourite, add to playlist) | Toast "Couldn't save that. Try again." and the optimistic change rolls back | Undo is the rollback |
| Song can't play | Toast "Couldn't play {title}. Skipped." and auto-skip | |
| Song removed | Row at 40 % opacity, "Unavailable"; skipped in playback; queue shows "Removed" | Remove from list |
| Rate limited (429) | Toast "Slow down a little, then try again." | |
| Signed out / token expired | Silent refresh; if it fails, gate sheet "Please sign in again" | **Sign in** |
| Forbidden (admin pages) | "That's not for you" (H1) and a Home button | |
| 404 | Equalizer, "That page isn't on Geet", **Search** button | |
| 410 (removed track page) | "This song isn't on Geet anymore", **Search** | |
| Storage full when downloading | Toast "Not enough space on this device." | |
| Upload failed | Row in `danger`: plain reason + **Retry** | |
| Unexpected crash (error boundary) | `error.svg`, "Something broke on our side", **Reload** | Report to logs without personal data |

Copy rules: say what happened, then what to do. No "Oops", no codes shown to users (codes go to logs).

## Offline
- **Detection:** `navigator.onLine` plus failed fetch fallback.
- **Banner:** coral 28 px strip below the top bar: "You're offline. Saved songs still play."
- **What works:** Downloads tab, playing saved songs, previously visited pages (service worker page cache), saved lyrics, the offline page `/offline.html` for first-load without cache (provided file, recolored).
- **What shows "Needs a connection":** Search, Friends, Chat, Jams, Ask Geet, uploading, new playlists, admin.
- **Back online:** banner disappears with a toast "You're back online", queued play history syncs, pending favourite toggles flush.
- **offline.html** content (provided): illustration, "You're offline", "These songs are saved on this device. Chat, jams and remote play need a connection." (edit the sentence: remove "remote play" because it is not in v1: "Chat and jams need a connection."), list of saved songs with Play buttons, **Try again** button (yellow).

## Slow network
After 3 s of loading, show the line "Still loading…" in `text-2` under the skeleton. After 12 s, show the error state.
