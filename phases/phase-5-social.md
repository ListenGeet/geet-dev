# Phase 5 · Social

**Goal:** the "together" in Geet: friends, chat, jams, notifications, and account safety alerts.
**Ships:** two accounts can become friends, chat live, and hear the same song at the same moment in a jam.

## Read
Doc 07 (all) · doc 05 (Notifications, Signed-in devices) · doc 13 (social tables, Realtime) · doc 15 (Social, Jams) · doc 20 sections 4 and 9 · doc 11 (notification texts)

## Build
- [ ] Friends: requests, accept and decline, remove, block, public profile Add friend button live, username add, share link and QR, "Listening now" via `/api/presence` (throttled) and `friend_activity()`, privacy settings enforced.
- [ ] Suggestions (picker, note, limits).
- [ ] Notifications: bell sheet, unread dot, Web Push subscription (VAPID), per-type toggles in Settings, device registration.
- [ ] Chat: conversation list, thread, text, track cards, jam invite cards, typing indicator (broadcast), seen, delete for everyone, composer with track picker, rate limits, Realtime subscriptions (one shared socket, opened lazily).
- [ ] Jams: create, join by code or link, members, roles and control modes, shared queue, host transfer, end, and the **sync algorithm exactly as in doc 07** (`/api/time`, offset, drift correction, version guard). Jam room screen, jam strip, invite sheet.
- [ ] Bottom-nav badge for unread messages and requests.
- [ ] New sign-in alerts: device fingerprint, `sign_in_devices`, `signin-alert` email (not on first device or within 10 minutes of sign-up, max 3 per day), Signed-in devices list and **Sign out all other devices**.
- [ ] RLS tests for every social table (non-members cannot read jams or messages).

## Do not build yet
Assistant, promos, reports, admin, marketing email.

## Acceptance
- [ ] Two browsers (two accounts): friend request, accept, chat messages arrive live both ways, unread badge and Seen work.
- [ ] Jam: both hear the same song; start, pause, seek and next propagate; measured drift stays under 300 ms over 5 minutes (log it); a late joiner snaps to the right position; host leaving transfers host.
- [ ] A blocked user cannot find or message you.
- [ ] Signing in from a new browser sends exactly one alert with approximate location and no IP; the link lands on the devices list; sign out others works.
- [ ] Realtime connections stay closed until chat or a jam is opened (check the network tab).
- [ ] Push notification arrives for a friend request with the app closed (Android Chrome).

## Your decisions and accounts
- Generate VAPID keys; set `VAPID_*` env.
- Decide whether guests' friend share link `/u/name` should show the avatar (default: yes, name and avatar only).

## Prompt
> Read `README.md`, `phases/README.md`, `phases/phase-5-social.md` and the docs it lists. Phases 0 to 4 are done. Build Phase 5 only. Run the verify command, then run the two-browser chat test and the jam drift test and report the numbers. Reply briefly: what changed, verify result, anything blocked.
