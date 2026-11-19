# 04 · Public screens

Screens a guest can open. Shell (header, nav, player, footer) is in doc 02; components in doc 03.

---

## Home `/`

**Purpose:** get a song playing in one tap.

**Language filter row** (under the header, sticky on phone): chips `All · ਪੰਜਾਬੀ · हिन्दी · English` plus any other language present in the catalogue (e.g. ਉਰਦੂ). Choice filters every section below and is saved to the profile (guests: local storage).

Sections, top to bottom. Empty sections are omitted, never shown blank.

| # | Section | Who | Content |
|---|---|---|---|
| 1 | **Guest strip** | Guests only | 44 px `midnight` strip: "You're hearing 40-second previews." and a yellow text button "Sign in". Persistent, not dismissible |
| 2 | **Promo banner** | All | Active promo(s). See below |
| 3 | **Jump back in** | Signed in | Up to 6 quick tiles (2 columns phone, 3 desktop): recent playlists, Favourites, Daily Mix, recently played albums-as-playlists |
| 4 | **Made for you** | Signed in | Horizontal row of Mix cards: Daily Mix 1 to 3. Hidden until there is enough history (needs at least 5 favourites or plays) |
| 5 | **New on Geet** | All | Newest ready tracks, cover cards, 12 items, "See all" opens a full list |
| 6 | **Popular this week** | All | Top 10 by plays in the last 7 days. Numbered list (1 to 10 in Outfit 800 at left), two columns on desktop |
| 7 | **Artists you like** | Signed in with favourite artists | Circle artist cards from the profile's favourite artists |
| 8 | **Popular artists** | Guests, and signed in without favourite artists | Circle artist cards by play count |
| 9 | **Footer** | All | See doc 02 |

**Greeting:** none. No "Good evening, Name". The first thing is content.

**Promo banner**
- Phone: full width minus gutters, ratio 16:7, 6 px radius. Desktop: 21:6, max 1200 wide.
- Image fills it. A solid-to-transparent black scrim covers only the bottom 45 % (functional, for legibility).
- Text, bottom left, 16 px padding: kicker (caption style, yellow, e.g. "FEATURED ARTIST"), title (Outfit 800 24 phone / 36 desktop, max 2 lines), optional white pill button (label from the promo, default "Listen").
- Whole banner is a link (internal path or https URL; external opens in a new tab with a small arrow icon).
- More than one promo: auto-advance every 6 s, pause on hover/touch and when the tab is hidden, swipeable, indicator = row of small pills (yellow = current). `prefers-reduced-motion`: no auto-advance.
- Only promos with `active = true` and `now()` between `starts_at` and `ends_at`. A small "Announcement" or "Featured" caption label is the kicker; there is no "Ad" label because there are no ads.

**States:** loading = skeletons per section; error = error illustration with "Try again"; empty catalogue = no-downloads illustration, "Nothing here yet", button "Upload the first song" (admins) or text "Songs will appear here soon" (others).

---

## Search `/search`

**Header:** on phone, a 48 px search pill pinned under the top bar (autofocus on first open from the nav). Desktop: the header field drives this page.

### Before typing
1. **Recent searches** (signed in; guests: local): rows with a clock icon, query text, and an x button; "Clear all" text button at the section head. Tapping a row runs it.
2. **Browse by language:** tiles (doc 03) in two columns: ਪੰਜਾਬੀ, हिन्दी, English, and others present. Tap opens a filtered list page `/search?language=pa`.
3. **Browse by genre:** same tile style, only genres that exist in the catalogue.

### While typing (250 ms debounce)
- Chips: **All · Songs · Artists**.
- **All:** *Top result* card (large: cover 96, title Outfit 700 24, artist, a yellow play circle), then **Songs** (4 rows, "Show all"), then **Artists** (circle row).
- **Songs:** full track rows, infinite scroll, 30 per page.
- **Artists:** artist cards.
- Matching is tolerant: case-insensitive, accent-insensitive, typo-tolerant (trigram) over title, artist, album, and an optional Latin-script transliteration field so "dil" finds ਦਿਲ and दिल.
- Submitting (Enter, or tapping a result) saves to search history.

### States
- No results: `no-results.svg`, "No songs for “{query}”", "Check the spelling, or search the artist's name." Button: **Ask Geet to find it** (opens the assistant with the query prefilled; guests see the gate).
- Offline: "Search needs a connection" with the offline illustration and a button "Open downloads".

---

## Artist `/artist/[name]`

There is no artist table; the page is built from tracks whose normalized artist name matches.

- **Header:** circle image 160 (cover of most-played song), Outfit 800 name (Display size), caption "Artist", line `N songs`. Phone: centered; desktop: left-aligned beside the image.
- **Actions:** **Play** (large yellow circle), **Shuffle** (secondary pill), heart-outline button "Add to favourite artists" (toggles; filled yellow when on), overflow: Copy link.
- **Popular:** top 5 tracks by plays, "Show all" expands to all.
- **All songs:** the rest, newest first.
- 404 for an unknown name: "We don't have that artist" with a Search button.

---

## Playlist `/playlists/[id]`

Visible only to the owner (RLS). Daily Mix and Favourites use the same layout, read-only.

- **Header (phone):** collage cover 200 centered (2×2 of first four covers; one cover if fewer than four; fallback tile if empty). Below: caption "Playlist" (or "Daily Mix"), name (Display size, tap opens rename for owners), meta line: owner avatar 20 + "You" · `12 songs, 46 min`.
- **Header (desktop):** collage 232 at left, text at right, bottom aligned.
- **Action row:** **Play** (yellow circle 56), **Shuffle** (icon), **Download** (arrow-circle-down; ring while downloading; filled when all songs saved; tapping when saved asks "Remove downloads?"), **Add songs** (plus-circle), **⋯**.
- **⋯ menu:** Rename, Delete playlist (destructive confirm: "Delete “Name”? Songs stay on Geet."), Remove downloads. Read-only mixes: only Download and Remove downloads.
- **List:** track rows with drag handles, add date column on desktop, swipe-to-remove on phone. Reorder persists on drop (updates `position`).
- **Add songs block** (bottom of an owned playlist): "Let's find something for this playlist" with a search field and 5 suggestions drawn from the owner's favourite artists; each row has a **Add** secondary pill small. Plus a text link "Ask Geet to add songs".
- Empty owned playlist: `no-results.svg` replaced by the equalizer art, "This playlist is empty", button **Add songs**.
- Removed songs stay as 40 % rows "Unavailable" with a remove button, and are skipped when playing.

**Create playlist** (from Library "+", sidebar "+", or "Add to playlist" → "New playlist"): sheet with one field "Name" (default "My playlist #N"), button **Create** (primary). Max 100 chars. Max 200 playlists per user, 500 songs each.

---

## Track share page `/t/[id]`

Public landing for a shared link; the page a friend opens from a chat or message.
- Centered column 480 wide on desktop; full width on phone.
- Cover 320, title (Outfit 800 28), artist link, language and genre as small chips.
- **Guest:** yellow **Play 40-second preview** button, below it text "Sign in to hear the full song" and a secondary "Sign in". 
- **Signed in:** yellow **Play**, secondary **Add to playlist**, **Open in Geet** if on the share domain.
- Text link "Report this song". Footer.
- **Social preview** (Open Graph / Twitter): 1200×630, navy `midnight` background, cover at left 360 px, "Geet" wordmark small top right, title and artist at right, tagline at the bottom. Generated server-side. Fallback: `og/geet-default.jpg`.
- Removed or hidden track: "This song isn't on Geet anymore" with a Search button; HTTP 410.

---

## Public profile `/u/[username]`
Avatar 96, display name, @username. A single button: **Add friend** (primary), or **Friends** (disabled) / **Request sent** / **Accept request**. Guests: "Sign in to add friends". Nothing else is public: no listening history, no email.

---

## Legal pages `/terms`, `/privacy`, `/copyright`
Plain long-form pages, max width 680, H1 + H2s + body, same footer. Content to include:
- **Terms:** who may use it, uploading rules (you must own or have permission), prohibited content, removal at our discretion, no warranty, contact.
- **Privacy:** what is stored (profile, favourites, playlists, play history for 12 months, chat messages, device and push tokens), processors (Clerk, Supabase, Backblaze, Vercel, Cloudflare, NVIDIA for assistant requests), how to delete the account and data, children (no one under 13), contact.
- **Copyright and takedowns:** how to report, what to include (work, location of the song on Geet, your contact, statement of good faith and authority), a **public form** posting to the reports system as kind `copyright` with the claimant's email, response promise (for example within 3 working days), repeat-uploader policy. Have a lawyer review all three before launch; they are drafts of intent, not legal advice.
