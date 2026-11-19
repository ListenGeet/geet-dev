# 03 · Components

Every reusable piece, with states. Tokens refer to doc 01.

## Buttons
| Type | Look | Use |
|---|---|---|
| **Primary** | `accent` fill, black text Inter 600 15, pill, 44 px high (36 small), 20 px horizontal padding | The one main action on a screen |
| **Secondary** | 1 px white outline (`rgba(255,255,255,.4)`), white text, pill | Second-most action |
| **Text** | No fill, white (or `text-2`), underline on hover | Tertiary, "Cancel", "Clear all" |
| **Destructive** | Same as secondary but `danger` outline and text; primary version `danger` fill black text for confirm dialogs | Delete, remove |
| **Icon button** | 44 px target, 24 px icon, round hover fill `raised` | Heart, more, close |
| **Play (large)** | `accent` circle 56 px, black play glyph. Only on content headers (playlist, artist, album-like lists) | Start playing a list |
| **Transport play/pause** | White circle 40 (bars) / 72 (full player), black glyph | Playback state control |

States: hover `accent-soft` (primary) or `raised` fill (others); pressed scale .98 and `accent-press`; focus-visible 2 px `accent` outline offset 2; disabled 40 % opacity, no pointer; loading replaces label with the 3-bar equalizer, width locked.

## Heart (favourite)
Outline heart `text-2`; on: filled `accent`. Toggle animates a 120 ms scale 1 → 1.15 → 1. Optimistic update, rolled back with a toast on failure. Guests: tapping opens the sign-in gate sheet.

## Cover
Square, 6 px radius, `surface` placeholder while loading, then fade-in 120 ms. Fallback: `cover-fallback.svg` duotone (doc 01). Always has empty `alt` (decorative; the title is next to it).

## Track row
The most-used component. Heights: 56 px (phone), 56 px (desktop list).

Phone layout: `[cover 48] [title / artist + badges] [⋯]`
Desktop layout (columns): `# | cover 40 + title/artist | album | added | duration | ⋯`, with a header row (caption style) on playlist and library lists.

| Element | Detail |
|---|---|
| Index `#` | Number, tabular. On hover shows a play triangle; while playing shows the yellow equalizer |
| Title | Inter 600 15, one line, ellipsis. **Yellow when this is the current track** |
| Artist | 13 `text-2`, one line. Click goes to artist page |
| Badges (inline before artist) | Downloaded: small filled arrow-circle in `accent` 14 px. Removed or unavailable: row at 40 % with "Unavailable" |
| Duration | `3:51`, tabular, `text-2` |
| Overflow `⋯` | Opens the track menu |
| Selected / playing row | Background `accent-tint` only for the playing track on desktop |
| Hover | Background `raised` |
| Tap (phone) | Play this track in the context list |
| Swipe left (phone, playlist owner) | Reveals "Remove" in `danger` |
| Swipe right | "Add to queue" (yellow icon) |
| Long press | Selection mode (multi-select: Add to playlist, Download, Add to queue) |
| Drag handle (playlist owner) | Six-dot icon at left on desktop hover; long-press-drag on phone |

### Track menu (⋯), in this order
1. Add to queue
2. Play next
3. Add to playlist… (opens the picker sheet)
4. Remove from this playlist (only inside an owned playlist)
5. Favourite / Remove from favourites
6. Download / Remove download
7. Go to artist
8. Suggest to a friend… (friend picker)
9. Start a jam with this song
10. Copy link
11. Report this song… (in `text-2`, last)

Guests see the list but items 3, 5, 6, 8, 9 open the sign-in gate.

## Cards
- **Cover card** (carousel): cover 148 (phone) / 180 (desktop), title Inter 600 14 below (2 lines max), subtitle 13 `text-2`. No card background; the hover state is a play button (yellow circle 48) rising from the cover's bottom-right on desktop.
- **Artist card:** circle 148, name centered below, "Artist" in `text-2`.
- **Mix card:** 2×2 cover collage with a yellow circular number badge (Outfit 800) at top left; title "Daily Mix 1", subtitle with the top 3 artists.
- **Quick tile** (Home "Jump back in"): 56 px high row, `surface` fill, radius 6, cover 56 flush left, title Inter 600 14 two lines, play button appears on hover.
- **Language tile** (Search browse): 120 px high, flat `surface` or `midnight` or `plum` fill, large script word (Outfit 800 28) bottom-left, 6 px radius. Max 3 fills, assigned by position, never rainbow.
- **Promo banner:** see doc 04.
- **Jam invite card and track card in chat:** doc 07.

## Chips and tabs
- **Chip:** pill 36 px high, `surface` fill, white text 14/500; selected: `accent` fill black text. Horizontal scroll, no wrap, hidden scrollbar, 8 px gap.
- **Underline tabs:** text 15/600; active white with a **3 px yellow bar** under it, inactive `text-2`. 1 px `line` under the group.
- **Segmented control:** not used (underline tabs instead).

## Inputs
- **Text field:** label above (13/600, `text-2`), field 48 px high, `surface` fill, 10 px radius, 1 px `line` border; focus 2 px `accent` outline; error border and helper in `danger`. Helper text 13 below.
- **Search field:** pill 44 px, magnifier left, clear button right.
- **Textarea:** same, auto-grow.
- **Select:** native `<select>` styled like a text field (best on phones).
- **Toggle:** 44×26 pill; on = `accent` track with black knob; off = `line-strong` with white knob.
- **Checkbox:** 22 px, 6 px radius, yellow when checked with a black check.
- **Slider (volume):** 4 px track, yellow fill, 12 px white thumb on hover/drag.
- **Segmented number/OTP:** Clerk handles it, themed.

## Overlays
- **Bottom sheet** (phone) / **centered dialog** (desktop, 440 px wide, 10 px radius): `surface` fill, 20 px top radius on sheets, drag handle 36×4 `line-strong`, scrim `rgba(0,0,0,.6)`. Swipe down or tap scrim to close. Focus is trapped; `Esc` closes.
- **Menu / popover:** `raised` fill, 10 px radius, `0 8px 24px rgba(0,0,0,.6)`, rows 44 px (36 px desktop), hover `line`.
- **Confirm dialog:** title, one sentence, two buttons: secondary "Cancel", then the action (destructive style if destructive). The destructive button names the action ("Remove song"), never "OK".
- **Toast:** bottom, above the player (16 px), white fill, black text 14/500, 8 px radius, max 360 wide, 4 s, optional "Undo" text button in black underlined. One at a time, newest replaces older. `role="status"`.
- **Banner:** full-width strip 28 to 36 px: offline (coral), guest strip (`midnight`), jam (yellow).
- **Tooltip** (desktop only): `raised`, 12 px, 400 ms delay.

## Feedback and loading
- **Skeleton:** static blocks of `surface` (cover square + two bars) matching the real layout; no shimmer, a 1.2 s opacity pulse 0.6 ↔ 1 only.
- **Equalizer:** five 3 px bars, heights animate between 20 % and 100 %, staggered 120 ms. Sizes 14 (inline), 24 (buffering), 48 (empty or loading screens), color `accent`.
- **Download progress:** a ring around the arrow icon, `line-strong` track, `accent` progress. Completed: filled yellow arrow-circle.
- **Pull to refresh** (phone, Home, Library, Friends): equalizer appears and animates while refreshing.
- **Offline chip:** tiny "Offline" caption on rows that need a connection.

## Avatar
Circle. Sizes 32, 40, 56, 96. Clerk image, else initials (Outfit 700) on a `plum`/`midnight` pair by hash of the user id. "Listening now" ring: 2 px `accent` ring with 2 px black gap.

## Badges
- **Count badge:** `accent` circle min 16 px, black 10/700 number, "9+" cap.
- **Dot:** 8 px `accent`.
- **Status chips (admin and uploads):** pill 24 px high. Ready: `accent-tint` fill, yellow text. Processing: `raised`, white. Failed: `danger` outline and text. Hidden/removed: `line-strong` fill, `text-2`.

## Empty state template
Illustration 240 px wide (recolored SVG), title (Outfit 700 20), one sentence (`text-2`), **one** button. Centered, 48 px top padding. Specific copy per screen is in doc 10.

## Tables (admin only)
Header row caption style, rows 52 px, hairlines, sticky header, hover `raised`, row click opens detail panel. Dense and plain: no zebra stripes, no card wrapper.
