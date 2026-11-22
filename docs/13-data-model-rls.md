# 13 · Data model, RLS, functions, retention

Supabase PostgreSQL. **RLS enabled on every table in `public`.** The service-role client bypasses RLS and is used only by trusted server code (the API). The server must authorize first, then call the database.

Migrations live in `supabase/migrations/NNNN_name.sql` (forward only, idempotent where possible). `npm run test:sql` applies them to an empty Postgres (CI uses a Postgres service) and runs assertion scripts in `supabase/tests/`.

## Identity
Clerk user ids are strings (`user_2abc…`), not UUIDs. Profiles use UUIDs, linked through `identities`.

```
public.identities(provider text, subject text, profile_id uuid, created_at)   -- PK (provider, subject)
public.uid() returns uuid   -- security definer, stable
   select profile_id from identities
   where provider = 'clerk' and subject = auth.jwt()->>'sub'
```
`provider` allows `firebase` later (the planned Android app) without schema change. Policies call `(select public.uid())` (wrapped in a sub-select so Postgres evaluates it once per statement).

## Tables

### People
| Table | Columns (type) | Notes |
|---|---|---|
| `profiles` | `id uuid pk`, `username text unique` (3-20, `[a-z0-9_.]`), `display_name text`, `avatar_url text`, `role text` (`user` / `uploader` / `admin`), `language text` (`en` / `pa` / `hi`), `music_languages text[]`, `favourite_artists text[]`, `show_listening text` (`friends` / `nobody`), `accept_requests text` (`everyone` / `nobody`), `onboarded_at timestamptz`, `username_changed_at`, `email_news bool default false`, `email_news_at`, `welcome_sent_at`, `created_at` | Readable by any authenticated user (name, username, avatar only through a view `public_profiles`; email is never stored here) |
| `identities` | above | Server only |
| `devices` | `id`, `profile_id`, `name`, `kind` (`web`/`android`/`ios`), `last_seen_at`, `listening_track_id`, `listening_since` | Own rows; presence for "Listening now". Friends read via a security-definer function that respects `show_listening` |
| `push_tokens` | `id`, `profile_id`, `device_id`, `kind` (`webpush`/`fcm`), `endpoint/token`, `keys jsonb`, `prefs jsonb`, `created_at` | Server only |

| `sign_in_devices` | `id`, `profile_id`, `fingerprint` (hash of browser family + OS family + country), `label` ("Chrome on Android"), `city`, `country`, `first_seen`, `last_seen`, `clerk_session_id` | Server only, and read by the owner through the API for the devices list. No IP stored. Rows deleted 90 days after `last_seen` |

### Email (doc 20)
| Table | Columns | Notes |
|---|---|---|
| `email_jobs` | `id`, `kind` (`code` / `welcome` / `alert` / `marketing` / `copyright` / `digest`), `priority int`, `profile_id` (nullable), `template`, `data jsonb`, `state` (`queued` / `sent` / `failed` / `cancelled`), `send_after`, `campaign_id` (nullable), `attempts`, `idempotency_key unique`, `created_at` | Server only. Drained by the queue with the daily budget rules |
| `email_campaigns` | `id`, `template`, `language`, `subject`, `preheader`, `content jsonb`, `scheduled_for`, `status`, `created_by`, `created_at` | Admin only |
| `email_log` | `id`, `job_id`, `template`, `profile_id`, `resend_id`, `status`, `created_at` | **No address or body stored.** Deleted after 90 days. Feeds the admin counts |
| `email_suppressions` | `profile_id` (pk), `reason` (`bounce` / `complaint` / `unsubscribe`), `created_at` | Server only. Marketing never sends to these |

### Catalogue
| Table | Columns | Notes |
|---|---|---|
| `tracks` | `id uuid pk`, `uploader_id`, `title`, `artist`, `artist_key` (normalized lower, trimmed, NFKC), `album`, `language`, `genre`, `search_text` (title + artist + album + transliteration), `translit`, `duration_ms`, `waveform smallint[64]`, `status` (`uploading` / `queued` / `processing` / `ready` / `failed` / `hidden` / `removed`), `plays int default 0`, `error text`, `created_at`, `removed_at`, `removed_by` | Index: GIN trigram on `search_text` (`pg_trgm`), btree `(status, created_at desc)`, `(artist_key)`, `(language)` |
| `track_files` | `track_id`, `kind` (`full` / `preview` / `cover`), `path`, `size_bytes`, `codec`, `bitrate_kbps`, `content_type` | Server only. Paths follow the key structure in doc 14 |
| `track_fingerprints` | `track_id uuid pk references tracks on delete cascade`, `sha256 char(64) unique`, `created_at` | Server only. Reserves the exact source-file digest across existing and in-flight uploads to prevent duplicates; unique constraint handles concurrent creates |
| `track_lyrics` | `track_id pk`, `plain text`, `synced jsonb` (array of `{t_ms, line}`) | Server only; served through the API |
| `promos` | `id`, `kicker`, `title`, `button_label`, `image_path`, `link`, `starts_at`, `ends_at`, `active bool`, `sort int`, `created_at` | Public read of active and in-date rows |
| `reports` | `id`, `track_id`, `reporter_id` (nullable), `reporter_email` (nullable, copyright), `kind` (`song` / `copyright`), `reason`, `note`, `claimant jsonb`, `status` (`open` / `dismissed` / `removed`), `handled_by`, `handled_at`, `created_at` | Insert by anyone through the API; read admin only |
| `upload_jobs` | `id`, `track_id`, `state` (`awaiting_upload` / `queued` / `running` / `done` / `failed`), `attempts int`, `lease_until timestamptz`, `claimed_by text`, `error`, `created_at`, `updated_at` | Server only. Atomic claim function below |
| `admin_log` | `id`, `admin_id`, `action`, `target_type`, `target_id`, `detail jsonb`, `created_at` | Admin read, server write |

### Library
| Table | Columns | Notes |
|---|---|---|
| `favorites` | `profile_id`, `track_id`, `created_at` | PK `(profile_id, track_id)`; own rows |
| `playlists` | `id`, `owner_id`, `name`, `kind` (`user` / `daily_mix`), `mix_index`, `updated_at`, `created_at` | Own rows |
| `playlist_tracks` | `playlist_id`, `track_id`, `position int`, `added_at` | PK `(playlist_id, track_id)`; owner via playlist; join filters `tracks.status='ready'` |
| `play_history` | `id`, `profile_id`, `track_id`, `played_at`, `listened_ms`, `outcome` (`completed` / `skipped` / `partial`) | Own rows. Removed after ~12 months |
| `search_history` | `id`, `profile_id`, `query`, `created_at` | Own rows; keep last 20 per user |

### Social
| Table | Columns | Notes |
|---|---|---|
| `friendships` | `id`, `requester_id`, `addressee_id`, `status` (`pending` / `accepted` / `blocked`), `created_at`, `updated_at` | One row per pair (unique on the unordered pair). Visible to the two people |
| `suggestions` | `id`, `from_id`, `to_id`, `track_id`, `note`, `seen_at`, `created_at` | Sender or receiver |
| `conversations` | `id`, `user_a`, `user_b` (ordered so `user_a < user_b`), `created_at`, `last_message_at` | Participants; friends only |
| `messages` | `id`, `conversation_id`, `sender_id`, `kind` (`text` / `track` / `jam`), `body`, `track_id`, `jam_id`, `deleted_at`, `created_at` | Participants. In Realtime publication |
| `conversation_reads` | `conversation_id`, `profile_id`, `last_read_at`, `last_read_message_id` | Own rows |
| `jams` | `id`, `code` (6 chars, unique, no confusable letters), `host_id`, `controls` (`host` / `everyone`), `track_id`, `position_ms`, `is_playing`, `version int`, `updated_at`, `ended_at`, `created_at` | Members read; writes through the API. In Realtime publication |
| `jam_members` | `jam_id`, `profile_id`, `joined_at`, `left_at` | Max 8 active (enforced in the join function). In Realtime publication |
| `jam_queue` | `id`, `jam_id`, `track_id`, `added_by`, `position`, `created_at` | Members. In Realtime publication |

### Operational
| Table | Columns | Notes |
|---|---|---|
| `usage_daily` | `profile_id`, `day date`, `plays int`, `uploads int`, `ai_count int` | PK `(profile_id, day)`. Server only |
| `rate_limits` | `key text`, `window_start timestamptz`, `count int` | PK `(key, window_start)`. Rows older than 1 day removed |
| `egress_daily` | `day date`, `provider text`, `bytes bigint` | Estimated from file sizes at signing time. Server only |

## RLS summary
| Group | Policy |
|---|---|
| `profiles` | Select: authenticated may read the safe columns (via view). Update: only own row; `role` and `username_changed_at` cannot be changed by the user |
| User data (`favorites`, `playlists`, `playlist_tracks`, `play_history`, `search_history`, `devices`, `conversation_reads`) | All actions only where `profile_id` / `owner_id = (select uid())`; `playlist_tracks` through the owning playlist |
| Friends, conversations, messages, jams | Select/insert only when the user is one of the people involved or a current jam member; `messages` insert requires `sender_id = uid()` and an accepted friendship; updates limited to `deleted_at` by the sender |
| Catalogue | `tracks`: public select where `status = 'ready'`. `promos`: public select where `active` and within dates. Everything else: no policy, so server only |
| Server-only (`track_files`, `track_fingerprints`, `track_lyrics`, `usage_daily`, `rate_limits`, `egress_daily`, `upload_jobs`, `identities`, `push_tokens`, `admin_log`, `reports` select) | RLS on with **no policies** |
| Sensitive operations | `security definer` functions with explicit `grant execute` to the service role or authenticated, each re-checking `uid()` |

Tests (`supabase/tests/*.sql`) must prove: a user cannot read another user's favourites, playlists, history or messages; a non-member cannot read a jam; a stranger cannot insert a message; `tracks` with `status <> 'ready'` are invisible to anon; server-only tables return nothing to `authenticated`.

## Functions
| Function | Purpose |
|---|---|
| `uid()` | Identity mapping above |
| `claim_upload_job(worker text, lease_seconds int)` | `select … for update skip locked` the oldest `queued` job (or `running` with expired lease), set `running`, `attempts+1`, lease; returns the job. Atomic; supports retries and lease recovery. Max 3 attempts then `failed` |
| `complete_upload_job(job_id, …)` / `fail_upload_job(job_id, error)` | Finish and flip `tracks.status` |
| `rate_limit_hit(key, limit, window_seconds)` | Increments a counter and returns whether the call is allowed. Cross-instance |
| `bump_usage(profile, field)` | Upserts `usage_daily` |
| `record_egress(provider, bytes)` | Adds to `egress_daily` |
| `popular_tracks(language, days, limit)` | Top tracks by recent plays |
| `search_tracks(q, language, limit, offset)` | Trigram plus prefix search over `search_text` |
| `generate_daily_mix(profile)` | Builds Daily Mix 1 to 3 from favourite artists, history, and similar tracks (same artist, language, genre), de-duplicated, 25 songs each |
| `join_jam(code)` | Checks capacity (8) and status; inserts the member |
| `remove_track(track_id, admin)` | The removal transaction (doc 09); the server then deletes the storage objects |
| `friend_activity()` | Friends' "listening now", honoring each friend's privacy setting |

## Realtime
Publication includes `messages`, `jams`, `jam_members`, `jam_queue`, `friendships`, `suggestions`. Subscribers receive only rows RLS lets them see. Typing indicators and jam presence use Realtime broadcast/presence (not stored).

## Retention and operations
| Data | Rule | Runs |
|---|---|---|
| `play_history` | Delete older than about 12 months | Daily cleanup cron |
| `email_log`, `sign_in_devices` | Delete after 90 days (devices: since `last_seen`) | Daily cleanup cron |
| `rate_limits` | Delete older than 1 day | Daily cleanup cron |
| `upload_jobs` | Delete `done` / `failed` older than 14 days | Daily cleanup cron |
| `search_history` | Keep newest 20 per user | On insert |
| `jams` | End jams idle 6 h; delete ended jams older than 30 days | Daily cleanup cron |
| Daily Mix | Regenerate all active users' mixes | Daily cron |
| Storage egress | Estimated, not read from provider billing | At signing |
| Keepalive | Touch the database so the free project never pauses | Daily Vercel cron + GitHub workflow |
| Backups | Weekly catalog and config export, **encrypted** (doc 16): tables `tracks`, `track_files`, `track_lyrics`, `promos`. Never emails, tokens, messages, history | GitHub workflow |

## Provider migration (B2 ↔ Supabase)
Object keys never change. To migrate: copy every object to the new provider with the same key, verify counts and sizes, then change `STORAGE_PROVIDER`. Signed URLs are always generated at request time, so no stored URL needs rewriting. Document this runbook in `docs/storage-migration.md` in the repo.
