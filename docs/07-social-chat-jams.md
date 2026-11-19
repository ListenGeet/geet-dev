# 07 · Friends, chat, jams

All of this requires sign-in. Realtime uses Supabase Realtime directly from the browser with the Clerk session token (Supabase third-party auth), protected by RLS (doc 13). Free-plan Realtime limits: 200 concurrent connections, 2 million messages per month. Design below stays inside that.

---

## Friends `/friends`

Header: title "Friends", at right **Add friend** (person-plus icon + label on desktop).
Underline tabs: **Friends · Requests**. Requests tab shows a count badge when non-zero.

### Friends tab
1. **Listening now** row (hidden if empty): horizontal scroll of friends currently playing: avatar 56 with the yellow "listening" ring, first name, below it `Song · Artist` truncated to one line. Tap opens the friend sheet.
2. **Friend list** alphabetical, rows 64 px: avatar 40, display name (Inter 600), @username (`text-2`) and status ("Listening to Song" with a tiny equalizer, or "Last seen 2 h ago", or nothing if they hide status). Right: **Message** icon button, ⋯ menu.
3. **Friend sheet** (tap a row or ring): avatar 96, name, @username; buttons **Message** (primary), **Listen to this** (secondary, only if they are playing something visible to friends), **Start a jam**, text button **More** → Suggest a song, Remove friend (confirm), Block (confirm).
4. Empty: equalizer art, "No friends yet", "Add someone by their username, or share your link." Buttons **Add friend** (primary) and **Share my link** (secondary).

### Requests tab
- **Incoming:** avatar, name, @username, **Accept** (small yellow pill) and **Decline** (text).
- **Sent:** avatar, name, "Pending", **Cancel** (text).
- Empty: "No requests right now."

### Add friend (sheet or dialog)
- Field "Username" with "@" prefix. As you type (300 ms), shows the matching profile preview (avatar, name) or "No one with that username."
- Button **Send request**. Rate limit: 20 requests per day. Cannot add yourself, blocked users, or existing friends.
- Below: **Share my link** (copies / shares `https://listengeet.com/u/{username}` with text "Add me on Geet"), and a **QR code** of that link (useful in person).

### Rules
- Friendship has states: pending, accepted, blocked (one row per pair). A request from a blocked user is silently ignored. Blocking removes the friendship and hides both users from each other everywhere, including search by username.
- Privacy toggles from Settings apply: "Show what I'm listening to" (Friends / Nobody).

---

## Suggestions
"Suggest to a friend" (from any track menu or the player) opens a friend picker (search, multi-select) and an optional short note (max 140 chars). Sending creates a `suggestions` row and a push or notification entry for the friend. The friend sees it under the bell and as a track card in the chat thread. Max 20 suggestions a day.

---

## Messages `/chat`

### Conversation list
- Header: title "Messages", **New message** button (pencil icon) → friend picker.
- Search field "Search messages" (searches names only in v1).
- Rows 72 px: avatar 48, name, last message preview (one line; for a track `♪ Song title`, for a jam `Jam invite`), time at right (Today `14:20`, Yesterday, `12 Nov`), unread **count badge** (yellow) and the name in 700 weight.
- Long press / hover ⋯: Mark read, Mute (v2, not in v1), Delete conversation (for me).
- Empty: "No messages yet" with a button **Find a friend**.

### Thread `/chat/[id]`
Bottom nav is hidden in a thread; the mini player stays.

**Header (56):** back, avatar 32, name (Inter 600) and a status line (Listening now · Song / Last seen / Typing…), right: **Start a jam** (users-three icon) and ⋯ (Block, Remove friend; no "report message" in v1).

**Messages**
- Mine: right aligned, `accent` bubble, black text; theirs: left aligned, `raised` bubble, white text. Radius 18 with a 4 px corner at the tail side. Max width 78 %. Consecutive messages within 2 minutes group with 2 px spacing and one timestamp.
- Day separators centered caption: "Today", "Yesterday", "Mon 9 Nov".
- Timestamps shown on tap (and under the last message of a group).
- **Seen:** under my last message, once read: caption "Seen" (`text-3`).
- **Track card** (inside the thread, not a bubble): `surface` card 260 wide, 1 px `line`, cover 64 at left, title and artist, a round play button (white 40). Tap card = open `/t/{id}`; button = play now (adds to queue). Unavailable tracks show "Song removed".
- **Jam invite card:** `midnight` card 260 wide: five-bar mark, "Jam with {name}", "{n} listening", **Join** (yellow small). Ended: "Jam ended" text and no button.
- **Typing indicator:** a small bubble with the three-bar equalizer, sent over a Realtime broadcast channel (not stored).
- Long press a message of mine: **Copy**, **Delete** ("Delete for everyone", soft delete shows "Message deleted" in `text-3` italic). Long press theirs: Copy.
- Links are not clickable except `listengeet.com` links (render as track cards when they point to `/t/{id}`).

**Composer:** `surface` bar with safe area: attach button (musical-note icon) → track picker sheet (tabs: **Now playing** shortcut at the top "Share what I'm playing", **Favourites**, **Search**); a text field (placeholder "Message", auto-grows to 5 lines); **send** (yellow circle 40, arrow-up; disabled while empty, and shows the equalizer while sending). Enter sends on desktop, Shift+Enter newline. Max 1000 characters; a counter appears at 900.

**Rules:** text, track cards and jam invites only (no images or files in v1). Rate limit 30 messages per minute per user. Only friends can message each other; blocking ends the thread. Messages are kept until a participant deletes the conversation or either account is deleted. New message while the thread is closed: unread count + push notification if enabled.

---

## Jams

A jam is a shared listening session: **everyone hears the same moment of the same song at the same time**, with a shared queue.

### Entry points
- Player ⋯ and action row: **Jam** → "Start a jam with {song}".
- Friend sheet / chat header: **Start a jam**.
- `/jam` hub: **Start a jam** (primary) and **Join with a code** (field, 6 characters).
- Link `/j/{code}` or a chat invite card.
- Jams are capped at **8 members** (keeps Realtime usage small). Guests cannot join: the gate sheet appears and returns to the link after sign-in.

### Roles and control
- **Host** creates the jam. Control mode (host can switch in the room's ⋯ menu): **Host controls playback** (default) or **Everyone controls playback**. In both modes **anyone can add songs to the queue**.
- Host leaves: the longest-present member becomes host. Last person leaves: jam ends. Idle 6 h: ends.

### Jam room `/jam/[id]` (full-screen, `midnight` background)
Top to bottom:
1. **Top row:** chevron-down (minimize; keeps the jam running, shows the jam strip), center: caption "JAM" and a code pill `ABC123` (tap copies, toast "Code copied"), right ⋯: Control mode (host), Leave jam, End jam (host, destructive).
2. **Members row:** overlapping avatars 40 (up to 5 shown, then "+3"), the host has a small crown glyph; tap opens a list sheet (name, "Host", Remove for host).
3. **Cover** 320 and title/artist like the full player.
4. **Bar scrubber:** same as the player. If the viewer cannot control playback, bars are not draggable and a small lock icon with "Host controls playback" appears under it.
5. **Transport:** previous, play/pause (white circle 72), next. Disabled (40 % opacity) for non-controllers.
6. **Invite** secondary pill **Invite friends** → sheet: friends with **Invite** buttons (sends a chat jam-invite card and push), **Copy link**, system **Share**.
7. **Up next:** queue list with "added by {name}" in `text-2` and a drag handle for controllers; button **Add songs** (search sheet; picking a song adds to the queue and toasts "Added to the jam").

### Sync design (how "same moment" works)
State lives in one `jams` row: `track_id`, `position_ms`, `is_playing`, `updated_at` (server time), `controls`, `host_id`. Changes are written through `POST /api/jams/{id}/state`; members subscribe to row changes over Realtime.

1. **Clock offset:** each client calls `GET /api/time` 3 times on joining (and every 5 minutes), takes the median of `serverNow - (t0+t1)/2` as its offset.
2. **Target position** at any instant: if playing, `position_ms + (nowServer - updated_at)`; if paused, `position_ms`.
3. On every state change: load the track if different, seek to the target, play or pause.
4. **Drift correction** every 5 s while playing: if `|audio.currentTime - target| > 300 ms` seek; between 80 and 300 ms nudge `playbackRate` to 1.03 or 0.97 for 3 s, then return to 1.
5. Track ends: the controller's client advances the queue (host in host-mode; the first member to reach the end in everyone-mode, guarded by a version number on the row so only one advance happens).
6. Late joiners load the current row and snap to the target.
7. Each listener streams their own signed URL for the same full file, so it works with B2 or Supabase and offline-saved songs are not used inside a jam.

Network loss: the member's room shows "Reconnecting…" (coral strip) and rejoins on reconnect with a fresh snapshot.

### Jam strip and mini player
While in a jam, the mini player is driven by the jam; a non-controller tapping a transport control gets a toast "Only the host can change songs. Leave the jam to play your own." and nothing changes.

### Empty and ended states
- Joining an ended jam or invalid code: "This jam has ended" or "We couldn't find that code" with buttons **Start your own** and **Back**.
- Host ends the jam: members get a sheet "The jam ended." and their player stops at the current song (they keep it paused locally).

### Limits and cost
8 members, one Realtime channel per jam, state writes only on user actions (not on every second), presence via Realtime presence. Expected message volume is a small fraction of the free 2 million per month.
