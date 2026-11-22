# 15 · API reference (`api.listengeet.com`)

Conventions
- JSON in and out. Errors: `{ "error": { "code": "string", "message": "plain words" } }` with the right HTTP status. Codes used: `unauthorized` 401, `forbidden` 403, `not_found` 404, `gone` 410, `duplicate` 409, `rate_limited` 429, `invalid` 422, `capped` 503.
- **Auth:** `Authorization: Bearer <Clerk session token>`. Levels: **public** (no token), **user**, **admin**, **cron** (`Authorization: Bearer <CRON_SECRET>`), **worker** (`Bearer <WORKER_SECRET>`).
- Pagination: `?limit=` (default 30, max 100) and `?cursor=`; responses `{ items, next }`.
- Every user endpoint is rate limited through `rate_limit_hit`. The server authorizes first, then uses the service-role client.
- All track lists exclude non-`ready` tracks. A track object: `{ id, title, artist, album, language, genre, durationMs, waveform, coverUrl: "/api/cover/{id}", favourite?, downloaded? }`.

## System
| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | `{ ok: true, version, db: "up" }`; used by the keepalive workflow |
| `GET /api/time` | public | `{ now: <ms> }` for jam clock sync |
| `GET /api/cron/keepalive` | cron | Touches the database |
| `GET /api/cron/cleanup` | cron | Retention rules (doc 13) |
| `GET /api/cron/daily-mix` | cron | Regenerates Daily Mix playlists |

## Email and webhooks (doc 20)
| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/webhooks/clerk` | Svix signature (`CLERK_WEBHOOK_SECRET`) | `user.created` → welcome; `user.deleted` → delete data; email event → send Geet's code email through Resend (idempotent by event id) |
| `POST /api/webhooks/resend` | Resend signature (`RESEND_WEBHOOK_SECRET`) | Bounce, complaint, delay, failure events (single endpoint, free-plan limit) |
| `GET/POST /api/email/unsubscribe?t=` | signed token | GET shows page data; POST (one-click from mail apps, or the button) sets `email_news=false`; `?undo=1` re-subscribes |
| `GET /api/cron/email-queue` | cron | Drains `email_jobs` within the daily budget (called hourly by a GitHub workflow) |
| `GET /api/devices` | user | Signed-in devices list |
| `POST /api/devices/sign-out-others` | user | Revokes the user's other Clerk sessions |
| `GET/POST /api/admin/emails/campaigns`, `POST /api/admin/emails/campaigns/{id}/test`, `/send`, `/cancel` | admin | Composer, test send, send, cancel |
| `GET /api/admin/emails/stats` | admin | Budget meter, subscriber count, history |

## Me and profiles

| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/me` | user | Profile, role, language, onboarding state, counts. Creates the profile and identity on first call (role `admin` if email in `ADMIN_EMAILS`) |
| `PATCH /api/me` | user | Update display name, language, music languages, favourite artists, privacy settings, `emailNews` (consent toggle) |
| `PUT /api/me/username` | user | Set or change username (availability and 30-day rule) |
| `GET /api/usernames/{name}/available` | user | Availability check |
| `DELETE /api/me` | user | Delete the account and personal data (body `{ confirm: "DELETE", deleteUploads: bool }`) |
| `GET /api/users/{username}` | public | Public profile card |

## Catalogue
| Method and path | Auth | Purpose |
|---|---|---|
| `GET /api/tracks` | public | List: `?sort=new|popular&language=&genre=&artist=` |
| `GET /api/tracks/{id}` | public | One track |
| `GET /api/tracks/{id}/play` | public | `{ url, expiresAt, preview: bool }`. Guests get the preview URL; signed-in users get full. Records egress. Honors the egress cap |
| `GET /api/cover/{id}` | public | 302 to signed cover URL, cacheable |
| `GET /api/lyrics/{id}` | public | `{ lyrics: { plain, synced, source } }` or `{ lyrics: null }`; source is `lrclib`, `lyrics_ovh`, or `uploader` |
| `GET /api/search?q=&type=all|songs|artists&language=` | public | Search. Returns `{ top, songs, artists }` |
| `GET /api/artists/{key}` | public | Artist header, popular, all songs |
| `GET /api/home` | public | Home feed (sections of doc 04), personalized if signed in |
| `GET /api/browse/languages`, `/api/browse/genres` | public | Tiles that exist in the catalogue |
| `GET /api/promos` | public | Active promos with signed image URLs |
| `POST /api/reports` | public (user optional) | `{ trackId, kind, reason, note, claimant? }`. Rate limited per IP and user |

## Library (user)
| Method and path | Purpose |
|---|---|
| `GET /api/favorites`, `PUT /api/favorites/{trackId}`, `DELETE /api/favorites/{trackId}` | Favourites |
| `GET /api/playlists`, `POST /api/playlists` | List (incl. Daily Mixes) and create `{ name }` |
| `GET /api/playlists/{id}`, `PATCH /api/playlists/{id}`, `DELETE /api/playlists/{id}` | Read, rename, delete |
| `POST /api/playlists/{id}/tracks` `{ trackIds }`, `DELETE /api/playlists/{id}/tracks/{trackId}`, `PUT /api/playlists/{id}/order` `{ trackIds }` | Add, remove, reorder |
| `POST /api/history` `{ trackId, listenedMs, outcome }` (batch allowed), `GET /api/history`, `DELETE /api/history` | Listening history |
| `GET /api/search/history`, `DELETE /api/search/history`, `DELETE /api/search/history/{id}` | Recent searches |
| `POST /api/downloads/check` `{ ids }` | Returns which saved ids were removed from the catalogue |

## Uploads (user, subject to `UPLOAD_MODE`)
| Method and path | Purpose |
|---|---|
| `POST /api/uploads` | Create one track + job from one file's metadata and `{ sha256 }`, return its signed upload URL(s); return `409 duplicate` when the exact file is already present or uploading |
| `POST /api/uploads/{trackId}/complete` | Verify object, queue, dispatch the worker |
| `GET /api/uploads/{trackId}` | Status for polling |
| `GET /api/uploads` | The user's uploads |
| `POST /api/uploads/{trackId}/retry` | Re-queue a failed upload |
| `DELETE /api/tracks/{id}` | Delete own track (or admin) |

## Social (user)
| Method and path | Purpose |
|---|---|
| `GET /api/friends` | Friends with status (respecting privacy), requests in and out |
| `POST /api/friends/requests` `{ username }` | Send request |
| `PATCH /api/friends/requests/{id}` `{ action: accept|decline|cancel }` | Respond |
| `DELETE /api/friends/{profileId}` | Remove |
| `POST /api/blocks/{profileId}`, `DELETE /api/blocks/{profileId}`, `GET /api/blocks` | Block list |
| `GET /api/friends/activity` | "Listening now" |
| `POST /api/presence` `{ trackId|null }` | Update "listening now" (throttled to once per 20 s) |
| `POST /api/suggestions` `{ toIds, trackId, note }`, `GET /api/suggestions` | Suggest a song |
| `GET /api/conversations`, `POST /api/conversations` `{ withId }` (get or create) | Conversations |
| `GET /api/conversations/{id}/messages?cursor=` | History (new messages arrive by Realtime) |
| `POST /api/conversations/{id}/messages` `{ kind, body?, trackId?, jamId? }` | Send |
| `DELETE /api/messages/{id}` | Delete for everyone (own) |
| `POST /api/conversations/{id}/read` | Mark read |
| `GET /api/notifications`, `POST /api/notifications/read` | Bell list |
| `POST /api/devices`, `POST /api/push/subscribe`, `DELETE /api/push/subscribe` | Device and Web Push subscription |

## Jams (user)
| Method and path | Purpose |
|---|---|
| `POST /api/jams` `{ trackId? }` | Create; returns `{ id, code }` and makes the caller host and member |
| `POST /api/jams/join` `{ code }` | Join (capacity 8) |
| `GET /api/jams/{id}` | Snapshot: state, members, queue, `serverNow` |
| `POST /api/jams/{id}/state` `{ trackId?, positionMs, isPlaying, expectedVersion }` | Change playback (host, or any member in everyone mode). Increments `version`; rejects stale versions |
| `POST /api/jams/{id}/queue` `{ trackId }`, `DELETE /api/jams/{id}/queue/{itemId}`, `PUT /api/jams/{id}/queue/order` | Shared queue |
| `PATCH /api/jams/{id}` `{ controls }` | Change mode (host) |
| `POST /api/jams/{id}/leave`, `POST /api/jams/{id}/end` | Leave / end |
| `POST /api/jams/{id}/invite` `{ toIds }` | Sends invite messages and pushes |

## Assistant (user)
| Method and path | Purpose |
|---|---|
| `POST /api/ai/chat` | Body `{ messages }` (last 20). **Streams** server-sent events: `text` chunks, `cards` (song lists, playlist proposals built from server data), `done`, `error`. Enforces daily and global limits; fallback model on failure |
| `POST /api/ai/playlist` | Confirm a proposal: `{ name, trackIds }` creates the playlist (max 50 tracks) |

## Admin
| Method and path | Purpose |
|---|---|
| `GET /api/admin/overview` | Stat blocks and meters |
| `GET /api/admin/reports?status=&kind=`, `GET /api/admin/reports/{id}` | Review |
| `POST /api/admin/reports/{id}/dismiss`, `/hide`, `/remove` | Actions (remove runs the removal procedure of doc 09) |
| `GET /api/admin/tracks`, `PATCH /api/admin/tracks/{id}`, `POST /api/admin/tracks/{id}/hide|unhide|remove|reprocess` | Track management |
| `GET/POST /api/admin/promos`, `PATCH/DELETE /api/admin/promos/{id}`, `POST /api/admin/promos/{id}/image` | Promos (image upload via signed URL) |
| `GET /api/admin/usage?days=30` | Charts data |
| `GET /api/admin/log` | Audit list |

## Worker (worker secret)
`POST /api/worker/claim`, `/heartbeat`, `/complete`, `/fail` (doc 14).

## Direct-to-Supabase (browser, Clerk token, RLS)
Realtime subscriptions only: `messages`, `jams`, `jam_members`, `jam_queue`, `friendships`, `suggestions`, `tracks` (own uploads' status). All writes go through the API.

## Idempotency and safety
- Favourite, friend request, add to playlist, queue add, and history inserts are idempotent (unique keys, `on conflict do nothing`).
- Validate every id with a UUID check; reject bodies over 64 KB; cap array sizes (playlist add 100, suggestion recipients 20).
- Never return emails, tokens, storage paths, or `role` of other users.
