# 09 · Admin `/admin`

Visible only to users whose `profiles.role = 'admin'`. Admin is set when the first sign-in email matches `ADMIN_EMAILS` (comma-separated env), and can be changed only in the database. Every admin API checks the role on the server; hiding the menu is not security.

## Shell
Desktop-first but usable on a phone. A plain layout, no sidebar branding: header 56 px with `geet-wordmark-white-bars.png` 20 px and "Admin" (Outfit 700), at right the exit link "Back to Geet". Below it, underline tabs: **Overview · Reports · Tracks · Promos · Emails · Usage**. Content max width 1200.

---

## Overview
Row of **stat blocks** (no card chrome; big number in Outfit 800 32, caption label under it, 1 px line between):
| Block | Source |
|---|---|
| Songs ready | `tracks` where `status='ready'` |
| Processing / failed | `upload_jobs` pending and failed counts, each links to Tracks filtered |
| Open reports | `reports` where `status='open'`, links to Reports |
| Active users (7 days) | distinct users in `play_history` last 7 days |
| Storage used | sum of `track_files.size_bytes` versus the provider's free cap (B2 10 GB, Supabase 1 GB): a 20-bar meter, bars turn `danger` coral above 90 % |
| Download egress this month | `egress_daily` sum versus cap (B2: 3× stored; Supabase: 5 GB): same meter. Labelled "estimated, from file sizes" |
| Assistant today | `usage_daily.ai_count` total versus `AI_DAILY_LIMIT × users` |
| Provider | Read-only: shows `STORAGE_PROVIDER` and the bucket name |

Below: **Needs attention** list: failed uploads (Retry), reports older than 48 h, storage over 80 %.

---

## Reports
Table (sticky header, sortable): **Song** (cover 32 + title, artist), **Reason**, **Reported by** (@username or email for copyright claims), **Kind** (Song report / Copyright), **Date**, **Status** chip (Open, Dismissed, Removed).
Filters above: status chips (Open default), kind, search.

**Row opens a review panel** (right side on desktop, full screen on phone):
1. Track header: cover, title, artist, uploader, upload date, language, duration.
2. A full-length **player** (admins always get the full file) with the bar scrubber.
3. The report: reason (from a fixed list: Copyright, Wrong or misleading info, Offensive or hateful, Spam, Other), free-text note, reporter, date. If copyright: claimant name, email, work and statement.
4. Other reports on this track (count and list).
5. Actions:
   - **Dismiss report** (secondary): status Dismissed, optional note. Track stays.
   - **Hide track** (secondary): sets `tracks.status='hidden'`: disappears from search and lists but files are kept so it can be restored.
   - **Remove track** (destructive): confirm dialog "Remove “{title}”? This deletes its audio and cover from storage and hides it everywhere, including playlists and downloads on devices. This can't be undone." Button "Remove song".
   - **Email uploader** link (mailto) for context. Admin sees the uploader's email only here.

**What "remove" does (server)**
1. Set `tracks.status='removed'` and `removed_at`, `removed_by`.
2. Delete from storage: `tracks/{id}/full.m4a`, `tracks/{id}/preview.m4a`, `covers/{id}.jpg`, any leftover `incoming/…`.
3. Delete `track_files` and `track_lyrics` rows. Keep the `tracks` row as a tombstone (id, title, artist, uploader, report ids) for the audit trail.
4. Hide from playlists: all playlist queries and RLS filter on `status='ready'`; `playlist_tracks` rows may stay (they render as "Unavailable" for the owner and are skipped in playback). Delete `favorites` rows for the track.
5. Mark all open reports on that track `Removed`.
6. Devices purge any downloaded copy on next online check (doc 06).

## Tracks
Table: cover, title, artist, language, uploader, duration, status chip (Ready, Processing, Failed, Hidden, Removed), plays, added date. Search and status filter.
Row panel:
- Edit metadata (title, artist, album, language, genre, search spelling, lyrics).
- Replace cover.
- **Hide / Unhide.**
- **Remove** (same as above).
- For Failed or stuck jobs: error text and **Retry processing** (resets the job to `queued` and triggers the worker).
- Link: copy share link.
**Bulk:** select rows → Hide, Remove (confirm with count). 

## Promos
List of promos (image thumbnail 120 px, title, dates, status chip Live / Scheduled / Ended / Off, order). **New promo** primary button.

**Promo form** (side panel; live preview above it, with a Phone / Desktop toggle that renders the real Home banner):
| Field | Rules |
|---|---|
| Image* | JPG or PNG or WebP, recommended 1600×700 (shown 16:7 and 21:6, with center-safe area guidance overlay), max 2 MB. Stored at `promos/{id}.jpg` through the storage layer |
| Kicker | Short caption, e.g. "FEATURED ARTIST" (max 24 chars) |
| Title* | Max 60 chars |
| Button label | Default "Listen" (max 16). Empty hides the button |
| Link* | Internal path (`/artist/Diljit`) or `https://` URL |
| Starts / Ends | Date-times (IST default), ends optional |
| Order | Number, lower first |
| Active | Toggle |
Buttons: **Save** (primary), **Duplicate**, **Delete** (confirm). Validation prevents `javascript:` and non-https external links.

## Emails
Marketing composer and send history. Transactional emails are automatic and are not edited here.

- **Top strip:** today's Resend budget as a 20-bar meter ("37 of 100 sent today", bars turn `danger` coral above 80), opted-in subscribers count, and "Daily marketing cap: 50".
- **New email** (primary): a side panel with a live preview (phone / desktop toggle, rendering the real template).
  | Field | Rules |
  |---|---|
  | Type | Announcement or Weekly new songs |
  | Language list | English, ਪੰਜਾਬੀ, हिन्दी: one send per language, to opted-in users of that language |
  | Subject* | Max 60 chars; character counter |
  | Preheader | Max 90 chars |
  | Hero image (announcement) | 1200×525 JPG, max 150 KB, with a centered safe-area guide |
  | Kicker, Headline*, Body*, Button label*, Button link* | Body accepts basic formatting (bold, link, line break) only; links must be https |
  | Songs (weekly) | Pick exactly 3 from a search, or **Use newest 3** |
  | Schedule | Send now or date-time (IST) |
- Under the form: **"Will reach N people, about D days at the free tier."** Computed from opted-in count, `MARKETING_DAILY_CAP` and the 1-per-week and 2-per-month frequency rules.
- **Buttons:** **Send test to me** (secondary; sends only to the admin's own address, subject prefixed "[TEST]"), **Schedule / Send** (primary, confirm dialog "Send to N people?"), **Cancel send** (while queued).
- The composer **refuses to send** if `MARKETING_POSTAL_ADDRESS` is empty (doc 20).
- **History table:** date, subject, language, status (Queued, Sending, Sent, Cancelled), sent, bounced, complaints, unsubscribed. No opens or clicks (tracking is off by design).
- **Suppressions:** count of suppressed addresses (bounced or complained). Addresses are never shown.

## Usage
Plain bar charts (bars in the brand's pill shape, yellow, single series each, last 30 days) from `usage_daily` and `egress_daily`: Plays per day, Uploads per day, Assistant messages per day, Estimated egress per day. Below: a table of top 10 tracks by plays this month and the top 10 users by assistant messages (for abuse spotting; shows @username only).

## Audit
Each admin action (dismiss, hide, remove, edit, promo change) writes a line to an `admin_log` table: who, what, target, time. Shown as a simple list at the bottom of Overview (last 20).
