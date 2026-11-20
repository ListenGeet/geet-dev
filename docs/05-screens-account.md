# 05 · Account screens

## Sign in / sign up `/sign-in`, `/sign-up`

Use Clerk's default `<SignIn>` and `<SignUp>` components inside Geet's auth shell. Keep the midnight background, side logo, tagline, and footer links; only set the Clerk card background to Geet's `--bg` token, leaving its controls and localization at their defaults. Configure Google and email one-time code in Clerk; phone SMS is excluded because it costs money. The Clerk provider routes to `/sign-in` and `/sign-up`; first sign-up goes to `/onboarding`, and later sign-ins return to the requested URL.

**Sign-in gate sheet** (shown when a guest hits a signed-in feature)
- Bottom sheet (phone) or dialog (desktop). Top: the five-bar mark in yellow, 40 px.
- Title: "Want the rest of this song?" (preview end) or context title: "Sign in to save songs" (heart), "Sign in to build playlists", "Sign in to listen with friends", "Sign in to ask Geet".
- Body: "Sign in free to hear full songs, build playlists and listen with friends."
- Buttons: **Sign in** (primary), **Create account** (secondary), **Keep browsing** (text).
- When triggered by preview end, the sheet opens as the preview ends and `audio/signin-prompt.mp3` (3.9 s) plays once. Playback stays stopped. If the audio is blocked by the browser, the sheet still shows.
- **Gate screens** for the Library, Friends, Ask tabs: same content full-page: the tab's own illustration (`no-downloads.svg`, `no-results.svg`, the Ask glyph), a one-line pitch of the feature, and the same buttons. Examples: Friends: "Add friends, chat, and listen to the same song at the same time." Ask: "Ask for songs, playlists and recommendations from everything on Geet."

---

## Onboarding `/onboarding`
Three steps, skippable except username. Progress shown as **three bars** (the brand shape) at the top, current bar yellow.

1. **Pick a username.** Field with prefix "@", prefilled from Clerk name, lowercased. Rules: 3 to 20 characters, `a-z 0-9 _ .`, unique. Live availability check ("@hardeep is taken", "@hardeep is yours"). Button **Next**. Required: friends find you by this.
2. **Your languages.** Large tiles in native script: ਪੰਜਾਬੀ, हिन्दी, English, plus others in the catalogue; multi-select, selected tiles become yellow. Button **Next**; text button "Skip".
3. **Pick a few artists.** Grid of circle artist cards (top 24 by plays within the chosen languages), tap to select (yellow ring and check). Below the grid, a toggle row: **"Send me news about new songs and features"** with the line "About twice a month. Unsubscribe any time." **Default off** (no pre-ticked consent). Button **Done**; "Skip". Selections go to `profiles.favourite_artists`; the toggle to `profiles.email_news` (doc 20).

Then Home. Onboarding is stored (`profiles.onboarded_at`) so it never repeats.

---

## Library `/library`
Header: title "Your library" (H1) and at right: **+** (create menu: Create playlist, Upload a song), sort control (text button with caret: Recently played, Recently added, A to Z), and view toggle (list / grid).

Underline tabs: **Playlists · Favourites · Downloads · History**.

| Tab | Content |
|---|---|
| Playlists | Pinned rows: Favourites, Downloads, Daily Mix 1 to 3. Then user playlists. "Create playlist" row at the end |
| Favourites | Track list of favourited songs, newest first, with a Play and Shuffle header. Empty: "Tap the heart on a song to keep it here." with a button "Find songs" |
| Downloads | See below |
| History | Recently played, grouped by day (Today, Yesterday, dates). Dedupes consecutive plays. Text button "Clear history" (confirm). Only completed or 30 s+ plays are shown |

**Downloads tab**
- Top block: storage meter: a row of 20 small bars, filled yellow in proportion to used space, caption "412 MB on this device" (from `navigator.storage.estimate()`), and text button **Remove all** (confirm).
- Track list with the "downloaded" badge. Rows can be removed individually with swipe or menu.
- A download in progress shows its ring; failed: row in `danger` text with **Retry**.
- Empty: `no-downloads.svg`, "Nothing saved for offline yet", "Tap the arrow on any song to keep it on this device." Button **Find songs**.
- **Offline behaviour:** when offline, only the Downloads tab is usable; other tabs show "Needs a connection" and a button to Downloads.

---

## Upload `/upload`
Allowed by `UPLOAD_MODE` (`admin`, `approved`, `anyone`). If not allowed: page "Uploads are limited right now" with a Home button.

**Step 1: choose a file**
- Phone: a single large **Choose audio file** primary button and a line "MP3, M4A, AAC, WAV, FLAC, OGG, Opus. Up to {MAX_TRACK_MB} MB." (default 50 MB: also the Supabase free-plan file cap).
- Desktop: the whole page accepts a drag-drop; while dragging, a full-page yellow-outlined overlay "Drop to upload".
- Multiple files allowed; each becomes its own row.

**Step 2: details** (per file, a stacked form)
| Field | Rules |
|---|---|
| Title* | Prefilled from file tags, filename cleaned |
| Artist* | Prefilled from tags. Autocomplete from existing artists to prevent duplicates ("Diljit" vs "Diljit Dosanjh") |
| Album | Optional |
| Language* | Select: ਪੰਜਾਬੀ, हिन्दी, English, Other (free text) |
| Genre | Select + "Other" |
| Search spelling | Optional "Also spelled in English letters" (e.g. "Dil"), helps search |
| Cover | Optional JPG or PNG up to 2 MB. If empty, cover is extracted from the file; if none, the fallback is used |
| Lyrics | Optional. Plain text, or `.lrc` with timestamps for synced lyrics |
| Rights* | Checkbox: "I own this song or have permission to share it on Geet." Required |

Button **Upload** (primary). Terms link under it.

**Step 3: progress** (per file row)
1. **Uploading** with percentage and an equalizer. The file goes straight from the browser to storage using a signed URL (doc 14), not through the server.
2. **Queued** → **Processing** → **Ready**. Ready rows show a small Play button and "View".
3. **Failed**: reason in plain words ("We couldn't read this file", "Longer than 15 minutes") with **Retry** and **Remove**.
Uploads continue if the user navigates within the app. On refresh, status is restored from the server.

**Your uploads:** a list at the bottom (also in Profile): status chip, title, date, **Delete** (own tracks only; confirm "This deletes the song from Geet for everyone").

**Limits:** `MAX_UPLOADS_PER_DAY` (default 5 for non-admins), file size, 15 minutes per song. Messages shown clearly before upload starts.

---

## Profile and settings `/profile`
One scrolling page, grouped list rows (no cards), each row: icon, label, value or chevron, 56 px.

**Header:** avatar 96, display name (Outfit 800 28), @username, a secondary pill **Edit profile**. Three stats in a row (Outfit 800 24 numbers, caption labels): Favourites, Playlists, Friends.

| Section | Rows |
|---|---|
| **Profile** | Display name, Username (with change allowed once per 30 days), Photo (opens Clerk's profile manager) |
| **Language** | App language: English, ਪੰਜਾਬੀ, हिन्दी (applies immediately). Music languages (multi-select, drives Home filter defaults) |
| **Music taste** | Favourite artists: chips with x, "Add artist" opens a search sheet |
| **Playback** | Autoplay similar songs when the queue ends (toggle, on), Show lyrics in the player (toggle, on), Keep screen awake in the full player (toggle, off) |
| **Downloads** | Storage used meter and "Remove all downloads" |
| **Email** | **Geet news** (toggle, default off, "About twice a month"). Under it, a fixed line: "Security and account emails are always on." Shows the language emails are sent in (follows App language) |
| **Notifications** | Push: Friend requests, Messages, Jam invites, Song suggestions (each a toggle). First enabling asks the browser for permission; if blocked, shows how to unblock. Uses Web Push, tokens saved in `push_tokens` |
| **Privacy** | "Show what I'm listening to": Friends / Nobody. "Who can send me friend requests": Everyone / Nobody. Blocked people (list with Unblock) |
| **Your uploads** | Link to the list (if allowed) |
| **Signed-in devices** (`/profile#devices`) | List of devices that have signed in ("Chrome on Android · Bathinda, India · active now", last seen), this device marked "This device". Button **Sign out all other devices** (confirm). Reached from the sign-in alert email (doc 20) |
| **Account** | Email (read only, from Clerk), Sign out, **Delete account** (destructive: dialog asks to type DELETE; removes profile, favourites, playlists, history, messages sent, friendships; uploaded tracks are kept unless the user also chooses "delete my uploads") |
| **About** | Version and build id, Open source (GitHub), Licences, Terms, Privacy, Copyright |
| Footer | Same footer as Home on phone |

Settings are saved on change (no Save button); a toast "Saved" confirms.

---

## Notifications (bell)
Bottom sheet on phone, popover 380 wide on desktop. Title "Notifications", text button "Mark all read".
Rows (56 to 72 px), unread have a yellow dot and `accent-tint` background:
| Type | Row | Inline action |
|---|---|---|
| Friend request | Avatar, "**Hardeep** sent you a friend request" | **Accept** (small yellow) and **Decline** (text) |
| Request accepted | "**Hardeep** accepted your request" | none |
| Suggestion | Cover, "**Hardeep** suggested **Song**" | **Play** |
| Jam invite | "**Hardeep** invited you to a jam" | **Join** (hidden if ended) |
Messages do not appear here; they use the Friends tab badge. Empty: "You're all caught up." with the equalizer, no illustration.
